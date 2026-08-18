import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  answerCallbackQuery,
  answerPreCheckoutQuery,
  forwardMessage,
  getSupportAdminChatId,
  inlineKeyboard,
  sendTelegramMessage
} from "@/lib/telegram-bot";
import { finalizeTelegramPayment } from "@/lib/payments";

// Публичный webhook-эндпоинт: сюда шлёт апдейты сам Telegram (после
// настройки через POST /api/admin/telegram/setup-webhook, см. task #83).
// Не проходит через requireUser — вместо этого проверяется секретный
// заголовок, который Telegram обязуется присылать неизменным, если он был
// задан при setWebhook (см. secret_token в lib/telegram-bot.ts::setWebhook).
//
// Все ошибки внутри намеренно гасятся и наружу всегда уходит 200 OK: иначе
// Telegram считает доставку неуспешной и повторяет один и тот же апдейт
// (в т.ч. дублируя пересылки в поддержку), см. документацию Bot API про
// retry-политику вебхуков.
function verifySecret(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true; // секрет не настроен — пропускаем (для локальной отладки)
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

const menuKeyboard = inlineKeyboard([
  [{ text: "Открыть кабинет", url: process.env.APP_URL || "https://creatin.world" }],
  [{ text: "Поддержка", callback_data: "support:start" }],
  [{ text: "Уведомления вкл/выкл", callback_data: "notify:toggle" }]
]);

async function handleStart(chatId: string) {
  await sendTelegramMessage(
    chatId,
    "Привет! Это бот CREATIN.WORLD.\n\n— «Открыть кабинет» — перейти на сайт.\n— «Поддержка» — написать нам, ответим прямо здесь.\n— «Уведомления вкл/выкл» — получать ли пуши о заказах и откликах в этот чат.",
    { replyMarkup: menuKeyboard }
  );
}

async function handleSupportIncoming(telegramId: string, chatId: string, messageId: number, text: string) {
  const user = await prisma.user.findUnique({ where: { telegramId } });

  if (!user) {
    await sendTelegramMessage(
      chatId,
      "Чтобы написать в поддержку, сначала войдите на сайте через этот же Telegram-аккаунт."
    );
    return;
  }

  const adminChatId = getSupportAdminChatId();
  if (!adminChatId) {
    await sendTelegramMessage(chatId, "Поддержка временно недоступна, попробуйте позже.");
    return;
  }

  const forwarded = await forwardMessage(adminChatId, chatId, messageId);
  await sendTelegramMessage(
    adminChatId,
    `Вопрос от ${user.name} (${user.telegramUsername ? "@" + user.telegramUsername : user.telegramId}) — ответьте на пересланное сообщение выше, Reply.`
  );

  await prisma.telegramSupportThread.create({
    data: {
      userId: user.id,
      adminChatId,
      adminMessageId: forwarded.message_id
    }
  });

  await sendTelegramMessage(chatId, "Спасибо, передали в поддержку. Ответим в этом чате.");
}

// Ответ админа на пересланное сообщение — ищем, кому он адресован, по
// (adminChatId, adminMessageId пересланного сообщения, на которое он Reply'ит).
async function handleSupportReply(adminChatId: string, replyToMessageId: number, text: string) {
  const thread = await prisma.telegramSupportThread.findUnique({
    where: { adminChatId_adminMessageId: { adminChatId, adminMessageId: replyToMessageId } },
    include: { user: true }
  });
  if (!thread) return false;

  // Прямой ответ на вопрос пользователя — доставляем всегда, независимо от
  // notificationPreference (это не рассылка, а ответ на его же обращение).
  await sendTelegramMessage(thread.user.telegramId, `Ответ поддержки:\n${text}`);
  return true;
}

async function handleNotifyToggle(telegramId: string, chatId: string, callbackQueryId: string) {
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    await answerCallbackQuery(callbackQueryId, "Сначала войдите на сайте.");
    return;
  }

  const next = user.notificationPreference === "platform" ? "telegram" : "platform";
  await prisma.user.update({ where: { id: user.id }, data: { notificationPreference: next } });

  await answerCallbackQuery(
    callbackQueryId,
    next === "telegram" ? "Уведомления в Telegram включены" : "Уведомления в Telegram выключены"
  );
  await sendTelegramMessage(
    chatId,
    next === "telegram"
      ? "Готово, теперь пуши о заказах и откликах приходят сюда."
      : "Готово, пуши в Telegram отключены — они остаются только внутри платформы."
  );
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return ok({ ok: true }, { status: 401 });
  }

  try {
    const update = (await request.json()) as Record<string, unknown>;

    const callbackQuery = update.callback_query as
      | { id: string; data?: string; from?: { id: number }; message?: { chat: { id: number }; message_id: number } }
      | undefined;
    if (callbackQuery?.data && callbackQuery.message) {
      const chatId = String(callbackQuery.message.chat.id);
      const telegramId = String(callbackQuery.from?.id ?? callbackQuery.message.chat.id);
      if (callbackQuery.data === "support:start") {
        await answerCallbackQuery(callbackQuery.id);
        await sendTelegramMessage(chatId, "Напишите ваш вопрос одним сообщением — мы ответим прямо здесь.");
      } else if (callbackQuery.data === "notify:toggle") {
        await handleNotifyToggle(telegramId, chatId, callbackQuery.id);
      } else {
        await answerCallbackQuery(callbackQuery.id);
      }
      return ok({ ok: true });
    }

    const preCheckoutQuery = update.pre_checkout_query as
      | { id: string; invoice_payload: string; from: { id: number } }
      | undefined;
    if (preCheckoutQuery) {
      // Полная проверка соответствия payload актуальному заказу/пакету — в
      // lib/payments.ts::finalizeTelegramPayment (task #82); здесь только
      // быстрый ack, обязательный в течение 10 секунд по правилам Bot API.
      await answerPreCheckoutQuery(preCheckoutQuery.id, true);
      return ok({ ok: true });
    }

    const message = update.message as
      | {
          message_id: number;
          chat: { id: number };
          from?: { id: number };
          text?: string;
          reply_to_message?: { message_id: number };
          successful_payment?: { invoice_payload: string; telegram_payment_charge_id: string };
        }
      | undefined;

    if (message) {
      const chatId = String(message.chat.id);
      const telegramId = message.from ? String(message.from.id) : chatId;

      if (message.successful_payment) {
        await finalizeTelegramPayment({
          telegramId,
          invoicePayload: message.successful_payment.invoice_payload,
          providerChargeId: message.successful_payment.telegram_payment_charge_id
        });
        await sendTelegramMessage(chatId, "Оплата прошла успешно, спасибо!");
        return ok({ ok: true });
      }

      if (message.text === "/start") {
        await handleStart(chatId);
        return ok({ ok: true });
      }

      // Ответ админа на пересланный вопрос: чат — один из TELEGRAM_ADMIN_IDS,
      // сообщение — Reply на что-то (пересланное сообщение пользователя).
      if (message.reply_to_message && message.text) {
        const handled = await handleSupportReply(chatId, message.reply_to_message.message_id, message.text);
        if (handled) return ok({ ok: true });
      }

      if (message.text && !message.text.startsWith("/")) {
        await handleSupportIncoming(telegramId, chatId, message.message_id, message.text);
        return ok({ ok: true });
      }
    }

    return ok({ ok: true });
  } catch (error) {
    console.error("telegram webhook failed", error);
    return ok({ ok: true });
  }
}
