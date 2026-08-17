import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Список откликов, отфильтрованный по роли текущего пользователя: креатор
// видит свои отклики, заказчик — все отклики по своим заказам, админ — всё.
// Публикация одного отклика создаётся отдельно, в POST /api/orders/[id]/applications.
export async function GET() {
  try {
    const user = await requireUser();
    if (user.role === Role.CREATOR && !user.creatorProfile) return ok({ applications: [] });
    if (user.role === Role.CLIENT && !user.clientProfile) return ok({ applications: [] });

    const where =
      user.role === Role.CREATOR
        ? { creatorProfileId: user.creatorProfile!.id }
        : user.role === Role.CLIENT
          ? { order: { clientProfileId: user.clientProfile!.id } }
          : {};

    const applications = await prisma.application.findMany({
      where,
      include: {
        order: true,
        creatorProfile: {
          include: { user: true }
        },
        chat: true
      },
      orderBy: { createdAt: "desc" }
    });

    return ok({ applications });
  } catch (error) {
    return fail(error);
  }
}
