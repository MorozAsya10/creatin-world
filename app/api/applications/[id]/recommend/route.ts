import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { refreshCreatorScore } from "@/lib/rating";
import { requireUser } from "@/lib/session";
import { notifyUser } from "@/lib/telegram-bot";

const recommendSchema = z.object({
  recommended: z.boolean()
});

// Заказчик отмечает "рекомендую / не рекомендую" исполнителя по конкретному
// отклику — только для заказов в статусе COMPLETED (см. PATCH
// /api/orders/[id] — клиент сам переводит свой заказ в этот статус) и только
// владелец заказа. Итоговый агрегат по всем откликам считается на
// GET /api/creators (Application.clientRecommended), сам отзыв нигде
// текстом не публикуется — см. комментарий у модели в schema.prisma.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser([Role.CLIENT]);
    const { id } = await params;
    const { recommended } = recommendSchema.parse(await request.json());

    const application = await prisma.application.findUnique({
      where: { id },
      include: { order: true, creatorProfile: { select: { userId: true } } }
    });
    if (!application) throw new ApiError(404, "Отклик не найден");
    if (application.order.clientProfileId !== user.clientProfile?.id) {
      throw new ApiError(403, "Это не ваш заказ");
    }
    if (application.order.status !== "COMPLETED") {
      throw new ApiError(409, "Оценить исполнителя можно только после завершения заказа");
    }

    const updated = await prisma.application.update({
      where: { id },
      data: { clientRecommended: recommended }
    });

    // Рекомендация — самый весомый компонент индекса (см. lib/rating.ts),
    // пересчитываем сразу.
    await refreshCreatorScore(application.creatorProfileId);

    await notifyUser(
      application.creatorProfile.userId,
      recommended
        ? `Заказчик рекомендует вас по заказу «${application.order.title}» — это влияет на ваш рейтинг.`
        : `Заказчик не рекомендует вас по заказу «${application.order.title}».`
    );

    return ok({ application: updated });
  } catch (error) {
    return fail(error);
  }
}
