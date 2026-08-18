import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { resolveViewRole } from "@/lib/dual-role";

// Список откликов, отфильтрованный по текущему виду кабинета (см.
// lib/dual-role.ts): креатор видит свои отклики, заказчик — все отклики по
// своим заказам, админ — всё. Публикация одного отклика создаётся отдельно,
// в POST /api/orders/[id]/applications.
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const viewRole = resolveViewRole(user, request.nextUrl.searchParams.get("as"));
    if (viewRole === Role.CREATOR && !user.creatorProfile) return ok({ applications: [] });
    if (viewRole === Role.CLIENT && !user.clientProfile) return ok({ applications: [] });

    const where =
      viewRole === Role.CREATOR
        ? { creatorProfileId: user.creatorProfile!.id }
        : viewRole === Role.CLIENT
          ? { order: { clientProfileId: user.clientProfile!.id } }
          : {};

    const applications = await prisma.application.findMany({
      where,
      include: {
        order: true,
        position: true,
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
