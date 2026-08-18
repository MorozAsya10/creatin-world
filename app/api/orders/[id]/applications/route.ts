import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail, ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { refreshCreatorScore } from "@/lib/rating";
import { requireUser } from "@/lib/session";

const applicationSchema = z.object({
  message: z.string().min(10),
  relevantCase: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  duration: z.string().optional(),
  // Опционален для обратной совместимости старых клиентов, но по факту
  // обязателен: если не прислан, берём единственную позицию заказа (кейс
  // вакансии, см. комментарий у OrderKind в schema.prisma). Для проекта с
  // несколькими позициями фронт обязан прислать конкретный positionId.
  positionId: z.string().cuid().optional()
});

// Отклик креатора на конкретную позицию заказа. upsert по
// [positionId, creatorProfileId] намеренно: повторная отправка формы
// (например, правка цены/сроков) просто обновляет существующий отклик на ту
// же позицию, а не создаёт дубль — уникальный индекс в schema.prisma
// (Application.@@unique) это же гарантирует и на уровне БД.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireUser([Role.CREATOR]);
    if (!user.creatorProfile) throw new ApiError(400, "Creator profile is required");

    const flags = await getFeatureFlags();
    if (flags.moderationRequired && !user.creatorProfile.isApproved) {
      throw new ApiError(403, "Creator profile must be approved before applying");
    }

    const order = await prisma.order.findFirst({
      where: { OR: [{ id }, { publicId: id }] },
      include: { positions: true }
    });
    if (!order) throw new ApiError(404, "Order not found");
    if (order.status !== "PUBLISHED") {
      throw new ApiError(409, "Отклик доступен только для опубликованных заказов");
    }

    const { positionId, ...body } = applicationSchema.parse(await request.json());
    const position = positionId
      ? order.positions.find((item) => item.id === positionId)
      : order.positions[0];
    if (!position) throw new ApiError(400, "Позиция не найдена в этом заказе");

    const application = await prisma.application.upsert({
      where: {
        positionId_creatorProfileId: {
          positionId: position.id,
          creatorProfileId: user.creatorProfile.id
        }
      },
      update: body,
      create: {
        ...body,
        orderId: order.id,
        positionId: position.id,
        creatorProfileId: user.creatorProfile.id
      },
      include: { order: true, creatorProfile: true, position: true, chat: true }
    });

    // Отклик — один из компонентов индекса ("активность на платформе", см.
    // lib/rating.ts), пересчитываем сразу.
    await refreshCreatorScore(user.creatorProfile.id);

    return ok({ application }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
