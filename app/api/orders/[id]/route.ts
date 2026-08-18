import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/session";

const updateSchema = z.object({
  status: z.enum(["PUBLISHED", "REJECTED", "COMPLETED", "ARCHIVED"])
});

// Один и тот же роут отдаёт и публичную карточку заказа (гостю или чужому
// креатору — только опубликованные заказы, без чужих откликов), и полную
// картину владельцу/админу (все отклики, полные данные компании, AI-топ-3).
// Объём данных зависит от canManage/isOwnApplication ниже, а не от отдельных
// query-параметров — то есть весь access control сосредоточен в одном месте.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const baseOrder = await prisma.order.findFirst({
      where: {
        OR: [{ id }, { publicId: id }]
      }
    });

    if (!baseOrder) throw new ApiError(404, "Order not found");

    // По наличию профиля, а не user.role — см. hasRole в lib/session.ts
    // (дуал-профильный пользователь управляет своими заказами как заказчик
    // и откликается как креатор независимо от того, кем изначально
    // зарегистрировался).
    const isOwner = Boolean(user?.clientProfile?.id) && user?.clientProfile?.id === baseOrder.clientProfileId;
    const canManage = user?.role === Role.ADMIN || isOwner;
    const isOwnApplication = Boolean(user?.creatorProfile);

    if (!canManage && baseOrder.status !== "PUBLISHED") {
      throw new ApiError(404, "Order not found");
    }

    const order = await prisma.order.findUnique({
      where: { id: baseOrder.id },
      include: {
        clientProfile: canManage
          ? true
          : {
              select: {
                companyName: true,
                industry: true,
                description: true
              }
            },
        positions: { orderBy: { createdAt: "asc" } },
        applications: {
          where: canManage
            ? {}
            : isOwnApplication
              ? { creatorProfileId: user!.creatorProfile!.id }
              : { id: "__hidden__" },
          include: {
            creatorProfile: {
              include: {
                user: canManage,
                files: true
              }
            },
            position: true,
            chat: true
          },
          orderBy: { createdAt: "desc" }
        },
        aiMatches: {
          orderBy: { rank: "asc" },
          include: {
            creatorProfile: {
              include: { files: true }
            }
          }
        }
      }
    });

    return ok({ order });
  } catch (error) {
    return fail(error);
  }
}

// Модерационные переходы (PUBLISHED/REJECTED/ARCHIVED) — только админ.
// COMPLETED — единственный статус, который вправе выставить сам заказчик,
// владелец заказа (без модерации): это его сигнал "работа сделана", и именно
// он открывает возможность оценить исполнителей (см.
// POST /api/applications/[id]/recommend).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser([Role.ADMIN, Role.CLIENT]);
    const { id } = await params;
    const { status } = updateSchema.parse(await request.json());
    const existing = await prisma.order.findFirst({
      where: { OR: [{ id }, { publicId: id }] }
    });
    if (!existing) throw new ApiError(404, "Заказ не найден");

    // По наличию clientProfile, а не user.role === CLIENT — см. hasRole в
    // lib/session.ts (дуал-профильный пользователь может управлять своими
    // заказами как заказчик, даже если изначально зарегистрировался как
    // креатор).
    if (user.clientProfile) {
      const isOwner = user.clientProfile.id === existing.clientProfileId;
      if (!isOwner) throw new ApiError(403, "Это не ваш заказ");
      if (status !== "COMPLETED") throw new ApiError(403, "Заказчик может только отметить заказ выполненным");
    }

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : existing.publishedAt
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: `order.${status.toLowerCase()}`,
        entity: "Order",
        entityId: order.id
      }
    });

    return ok({ order });
  } catch (error) {
    return fail(error);
  }
}
