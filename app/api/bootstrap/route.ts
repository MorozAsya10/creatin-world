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
      // Не флаг из БД (см. lib/config.ts) — просто "настроен ли на сервере
      // токен провайдера Telegram Payments" (BotFather -> Payments), чтобы
      // фронт показывал кнопку "Оплатить через Telegram" только когда она
      // реально сработает (см. lib/payments.ts::createTelegramInvoicePayment).
      telegramPaymentsEnabled: Boolean(process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN),
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
