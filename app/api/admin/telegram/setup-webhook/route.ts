import { Role } from "@prisma/client";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getWebhookInfo, setWebhook } from "@/lib/telegram-bot";

// Одноразовая (идемпотентная — можно жать сколько угодно раз) настройка
// вебхука бота. Существует отдельным роутом, а не скриптом/CLI-командой,
// потому что вызвать Telegram Bot API можно только с сервера, у которого
// есть реальный сетевой доступ (см. комментарий в lib/telegram-bot.ts —
// песочница разработки его не имеет). Админ жмёт кнопку в панели один раз
// после деплоя на Render, и/или заново — если поменяли APP_URL или бота.
export async function GET() {
  try {
    await requireUser([Role.ADMIN]);
    const info = await getWebhookInfo();
    return ok({ info });
  } catch (error) {
    return fail(error);
  }
}

export async function POST() {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new ApiError(500, "APP_URL is not configured");

    const url = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    await setWebhook(url, secret);

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "telegram.webhook_configured",
        entity: "System",
        payload: { url, secretConfigured: Boolean(secret) }
      }
    });

    return ok({ url }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
