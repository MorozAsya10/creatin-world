import { ok, fail } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Один запрос вместо нескольких для инициализации личного кабинета
// (PlatformShell) и публичной статистики на главной (HomeStats): текущий
// пользователь + feature flags + активные пакеты + счётчики. Работает и для
// гостя (user будет null) — HomeStats дёргает его без авторизации.
export async function GET() {
  try {
    const [user, flags, packages, creatorsCount, ordersCount] = await Promise.all([
      getCurrentUser(),
      getFeatureFlags(),
      prisma.package.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
      prisma.creatorProfile.count({ where: { isApproved: true } }),
      prisma.order.count({ where: { status: "PUBLISHED" } })
    ]);

    return ok({
      user,
      flags,
      packages,
      stats: {
        creators: creatorsCount,
        publishedOrders: ordersCount
      }
    });
  } catch (error) {
    return fail(error);
  }
}
