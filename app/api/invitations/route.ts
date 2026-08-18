import { NextRequest } from "next/server";
import { InvitationStatus, Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveViewRole } from "@/lib/dual-role";

const createSchema = z.object({
  orderId: z.string().min(1),
  creatorProfileId: z.string().min(1),
  message: z.string().min(10).max(1000)
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const viewRole = resolveViewRole(user, request.nextUrl.searchParams.get("as"));
    if (viewRole === Role.CREATOR && !user.creatorProfile) return ok({ invitations: [] });
    if (viewRole === Role.CLIENT && !user.clientProfile) return ok({ invitations: [] });

    const where =
      viewRole === Role.CREATOR
        ? { creatorProfileId: user.creatorProfile!.id }
        : viewRole === Role.CLIENT
          ? { clientProfileId: user.clientProfile!.id }
          : {};

    const invitations = await prisma.invitation.findMany({
      where,
      include: {
        order: true,
        creatorProfile: {
          include: {
            files: true
          }
        },
        clientProfile: true
      },
      orderBy: { createdAt: "desc" }
    });

    return ok({ invitations });
  } catch (error) {
    return fail(error);
  }
}

// Заказчик зовёт конкретного креатора откликнуться на свой заказ (обратное
// действие по сравнению с обычным откликом). upsert по [orderId,
// creatorProfileId] — повторное приглашение того же креатора на тот же
// заказ просто обновляет сообщение и статус, а не плодит дубли.
export async function POST(request: Request) {
  try {
    const user = await requireUser([Role.CLIENT, Role.ADMIN]);
    const body = createSchema.parse(await request.json());
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: body.orderId }, { publicId: body.orderId }]
      }
    });

    if (!order) throw new ApiError(404, "Заказ не найден");
    if (user.clientProfile && user.clientProfile.id !== order.clientProfileId) {
      throw new ApiError(403, "Приглашать может только владелец заказа");
    }
    if (order.status !== "PUBLISHED") {
      throw new ApiError(409, "Приглашения доступны только для опубликованных заказов");
    }

    const creator = await prisma.creatorProfile.findUnique({
      where: { id: body.creatorProfileId }
    });
    if (!creator || !creator.isApproved) {
      throw new ApiError(404, "Креатор не найден");
    }

    // orderId на Application остался как обычное (не уникальное) поле — у
    // проекта с несколькими позициями один креатор теоретически может
    // откликнуться на несколько позиций одного заказа, поэтому здесь ищем
    // любой отклик этого креатора в рамках заказа через findFirst, а не по
    // композитному уникальному ключу (тот теперь [positionId,
    // creatorProfileId], см. schema.prisma).
    const existingApplication = await prisma.application.findFirst({
      where: { orderId: order.id, creatorProfileId: creator.id }
    });
    if (existingApplication) {
      throw new ApiError(409, "Креатор уже откликнулся на этот заказ");
    }

    const invitation = await prisma.invitation.upsert({
      where: {
        orderId_creatorProfileId: {
          orderId: order.id,
          creatorProfileId: creator.id
        }
      },
      update: {
        message: body.message,
        status: InvitationStatus.SENT
      },
      create: {
        orderId: order.id,
        creatorProfileId: creator.id,
        clientProfileId: order.clientProfileId,
        message: body.message
      },
      include: {
        order: true,
        creatorProfile: true,
        clientProfile: true
      }
    });

    return ok({ invitation }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
