import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notifyChatMessage } from "@/lib/telegram-bot";

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const chat = await prisma.chat.findUnique({
      where: { id },
      include: {
        order: { select: { title: true } },
        creatorProfile: { select: { userId: true, firstName: true, lastName: true } },
        clientProfile: { select: { userId: true, companyName: true } }
      }
    });
    if (!chat) throw new ApiError(404, "Chat not found");

    // Только сам креатор/заказчик из этого чата или админ — иначе можно
    // было бы писать в чужие переговоры по id.
    const isParticipant =
      user.role === Role.ADMIN ||
      user.creatorProfile?.id === chat.creatorProfileId ||
      user.clientProfile?.id === chat.clientProfileId;

    if (!isParticipant) throw new ApiError(403, "Only chat participants can send messages");

    const body = messageSchema.parse(await request.json());
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          chatId: chat.id,
          senderId: user.id,
          body: body.body
        },
        include: { sender: true }
      }),
      prisma.chat.update({
        where: { id: chat.id },
        data: { updatedAt: new Date() }
      })
    ]);

    // Уведомляем не отправителя, а второго участника чата — по сохранённой
    // связи chat.creatorProfile/clientProfile, а не по user.role (см.
    // dual-role в lib/session.ts: сам отправитель может быть и креатором, и
    // заказчиком одновременно, поэтому сверяемся с id профиля, а не с ролью).
    const senderIsCreator = user.creatorProfile?.id === chat.creatorProfileId;
    const recipientUserId = senderIsCreator ? chat.clientProfile.userId : chat.creatorProfile.userId;
    // В тексте пуша — собеседник и заказ, чтобы даже "схлопнутое" уведомление
    // (см. notifyChatMessage) было понятно без открытия сайта.
    const counterpart = senderIsCreator
      ? chat.clientProfile.companyName
      : `${chat.creatorProfile.firstName} ${chat.creatorProfile.lastName}`;
    await notifyChatMessage(recipientUserId, chat.id, `${counterpart} · «${chat.order.title}»`, body.body.slice(0, 200));

    return ok({ message }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
