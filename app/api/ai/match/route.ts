import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { matchCreatorsForOrder } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  orderId: z.string().min(1)
});

// Запускает/перезапускает подбор топ-3 для заказа — см. lib/ai.ts для
// самого алгоритма (внешний AI + локальный fallback). Принимает и cuid, и
// publicId заказа для удобства (кнопка в кабинете шлёт id, но это на
// случай интеграций/тестов, которым проще оперировать publicId).
export async function POST(request: Request) {
  try {
    const user = await requireUser([Role.CLIENT, Role.ADMIN]);
    const { orderId } = schema.parse(await request.json());

    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { publicId: orderId }] }
    });
    if (!order) throw new ApiError(404, "Order not found");
    // Заказчик может запускать подбор только по своим заказам; админ — по любым.
    if (user.role === Role.CLIENT && user.clientProfile?.id !== order.clientProfileId) {
      throw new ApiError(403, "Only the order owner can run AI matching");
    }

    const matches = await matchCreatorsForOrder(order.id);
    return ok({ matches });
  } catch (error) {
    return fail(error);
  }
}
