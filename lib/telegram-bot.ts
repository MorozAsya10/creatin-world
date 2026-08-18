import { prisma } from "@/lib/prisma";

// Тонкая обёртка над Telegram Bot API. Все запросы идут на api.telegram.org —
// из песочницы разработки этот домен недоступен (сеть закрыта), но на
// Render-сервере (боевое окружение) сеть открыта, там всё работает штатно.
// Поэтому здесь нет ни одного вызова "на всякий случай" при импорте модуля —
// только внутри функций, которые реально дергаются рантаймом сервера.

const API_BASE = "https://api.telegram.org";

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

// Тот же список, что и в app/api/auth/telegram/route.ts (кто может войти в
// платформу как ADMIN) — здесь используется как получатель форвардов
// техподдержки: первый id в списке считается "дежурным" чатом поддержки.
export function getSupportAdminChatId(): string | null {
  const ids = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids[0] || null;
}

async function callTelegramApi<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description || response.statusText}`);
  }
  return data.result as T;
}

export type InlineButton = { text: string; callback_data?: string; url?: string };

// Простая клавиатура из строк с одной или несколькими кнопками —
// используется и в /start, и в уведомлениях с быстрыми действиями.
export function inlineKeyboard(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: { replyMarkup?: ReturnType<typeof inlineKeyboard>; replyToMessageId?: number }
) {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: options?.replyMarkup,
    reply_to_message_id: options?.replyToMessageId
  });
}

// Пересылка исходного сообщения пользователя в чат поддержки — оставляет
// в чате админа кликабельную ссылку "Forwarded from" на автора, плюс
// возвращает message_id пересланного сообщения, который мы сохраняем в
// TelegramSupportThread для маршрутизации ответа обратно (см.
// app/api/telegram/webhook/route.ts).
export async function forwardMessage(
  toChatId: string | number,
  fromChatId: string | number,
  messageId: number
): Promise<{ message_id: number }> {
  return callTelegramApi<{ message_id: number }>("forwardMessage", {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false
  });
}

export async function setWebhook(url: string, secretToken?: string) {
  return callTelegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query", "pre_checkout_query"]
  });
}

export async function deleteWebhook() {
  return callTelegramApi("deleteWebhook", {});
}

export async function getWebhookInfo() {
  return callTelegramApi("getWebhookInfo", {});
}

// Инвойс через Telegram Payments. providerToken берётся из BotFather
// (/mybots → Payments → выбрать провайдера) — пока он не настроен пользователем,
// вызывающий код (app/api/payments) должен просто не показывать эту опцию.
export async function sendInvoice(input: {
  chatId: string | number;
  title: string;
  description: string;
  payload: string;
  currency: string;
  amountMinorUnits: number;
  label: string;
}) {
  const providerToken = process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN;
  if (!providerToken) throw new Error("TELEGRAM_PAYMENT_PROVIDER_TOKEN is not configured");

  return callTelegramApi("sendInvoice", {
    chat_id: input.chatId,
    title: input.title,
    description: input.description,
    payload: input.payload,
    provider_token: providerToken,
    currency: input.currency,
    prices: [{ label: input.label, amount: input.amountMinorUnits }]
  });
}

export async function answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
  return callTelegramApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    error_message: errorMessage
  });
}

// Единая точка отправки пуша пользователю платформы: сама решает, включены ли
// у него уведомления в Telegram и есть ли у него вообще привязанный аккаунт.
// Молча ничего не делает, если нет — вызывающий код (события заказов, чатов
// и т.д.) не должен сам проверять notificationPreference/telegramId.
export async function notifyUser(
  userId: string,
  text: string,
  options?: { replyMarkup?: ReturnType<typeof inlineKeyboard> }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true, notificationPreference: true }
  });

  if (!user?.telegramId) return;
  if (user.notificationPreference === "platform") return;

  try {
    await sendTelegramMessage(user.telegramId, text, options);
  } catch (error) {
    // Пуш — best-effort: не должен ронять основной запрос (создание отклика,
    // отправку сообщения и т.д.), если у Telegram временные проблемы.
    console.error("notifyUser failed", error);
  }
}

// Рассылка новостей — используется админ-роутом. Возвращает количество
// успешных и неуспешных доставок, чтобы админ видел реальный охват.
export async function broadcastTelegram(
  userIds: string[],
  text: string
): Promise<{ sent: number; failed: number }> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, telegramId: { not: undefined } },
    select: { telegramId: true, notificationPreference: true }
  });

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    if (!user.telegramId || user.notificationPreference === "platform") continue;
    try {
      await sendTelegramMessage(user.telegramId, text);
      sent += 1;
    } catch (error) {
      console.error("broadcastTelegram failed for a recipient", error);
      failed += 1;
    }
  }

  return { sent, failed };
}
