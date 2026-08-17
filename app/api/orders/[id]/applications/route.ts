import { z } from "zod";
import { Role } from "@prisma/client";
import { ok, fail, ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const applicationSchema = z.object({
  message: z.string().min(10),
  relevantCase: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  duration: z.string().optional()
});

// Отклик креатора на конкретный заказ. upsert по [orderId, creatorProfileId]
// намеренно: повторная отправка формы (например, правка цены/сроков) просто
// обновляет существующий отклик, а не создаёт дубль — уникальный индекс в
// schema.prisma (Application.@@unique) это же гарантирует и на уровне БД.
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
      where: { OR: [{ id }, { publicId: id }] }
    });
    if (!order) throw new ApiError(404, "Order not found");
    if (order.status !== "PUBLISHED") {
      throw new ApiError(409, "Отклик доступен только для опубликованных заказов");
    }

    const body = applicationSchema.parse(await request.json());
    const application = await prisma.application.upsert({
      where: {
        orderId_creatorProfileId: {
          orderId: order.id,
          creatorProfileId: user.creatorProfile.id
        }
      },
      update: body,
      create: {
        ...body,
        orderId: order.id,
        creatorProfileId: user.creatorProfile.id
      },
      include: { order: true, creatorProfile: true, chat: true }
    });

    return ok({ application }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
