import { InvitationStatus, Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notifyUser } from "@/lib/telegram-bot";

const schema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"])
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser([Role.CREATOR]);
    if (!user.creatorProfile) throw new ApiError(400, "Анкета креатора не найдена");

    const { id } = await params;
    const body = schema.parse(await request.json());
    const invitation = await prisma.invitation.findUnique({
      where: { id },
      include: {
        order: { include: { positions: true, clientProfile: { select: { userId: true } } } }
      }
    });

    if (!invitation) throw new ApiError(404, "Приглашение не найдено");
    if (invitation.creatorProfileId !== user.creatorProfile.id) {
      throw new ApiError(403, "Это приглашение адресовано другому креатору");
    }
    if (invitation.status !== InvitationStatus.SENT) {
      throw new ApiError(409, "Решение по приглашению уже принято");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextInvitation = await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: body.status }
      });

      // Принятое приглашение автоматически создаёт отклик от лица
      // креатора — так чат/дальнейшая работа с этим кандидатом идут по
      // тому же пути (через Application), что и обычный самостоятельный
      // отклик. Приглашение адресовано заказу в целом, без выбора
      // конкретной позиции проекта, поэтому используем первую позицию
      // заказа (у вакансии она и так единственная).
      const position = invitation.order.positions[0];
      if (body.status === "ACCEPTED" && position) {
        await tx.application.upsert({
          where: {
            positionId_creatorProfileId: {
              positionId: position.id,
              creatorProfileId: invitation.creatorProfileId
            }
          },
          update: {},
          create: {
            orderId: invitation.orderId,
            positionId: position.id,
            creatorProfileId: invitation.creatorProfileId,
            status: "SENT",
            message: `Принимаю приглашение на заказ «${invitation.order.title}». Готов(а) обсудить детали.`,
            relevantCase: user.creatorProfile?.portfolioUrl,
            duration: invitation.order.deadline
          }
        });
      }

      return nextInvitation;
    });

    await notifyUser(
      invitation.order.clientProfile.userId,
      body.status === "ACCEPTED"
        ? `Креатор принял приглашение на «${invitation.order.title}».`
        : `Креатор отклонил приглашение на «${invitation.order.title}».`
    );

    return ok({ invitation: updated });
  } catch (error) {
    return fail(error);
  }
}
