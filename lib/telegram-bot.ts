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
): Promise<{ message_id: number }> {
  return callTelegramApi<{ message_id: number }>("sendMessage", {
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

// Как forwardMessage, но без пометки "Forwarded from" — этим и отличается
// copyMessage в Bot API. Используем для ответа админа обратно пользователю
// (см. handleSupportReply в app/api/telegram/webhook/route.ts): пользователь
// не должен видеть личный Telegram-аккаунт админа, только "Ответ поддержки".
export async function copyMessage(
  toChatId: string | number,
  fromChatId: string | number,
  messageId: number
): Promise<{ message_id: number }> {
  return callTelegramApi<{ message_id: number }>("copyMessage", {
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

// Правим уже отправленное сообщение вместо того, чтобы слать новое — нужно,
// чтобы после нажатия "Одобрить/Отклонить" кнопки исчезали, а не копились в
// чате (см. запрос "не хочется, чтобы всё валилось в кучу").
export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  options?: { replyMarkup?: ReturnType<typeof inlineKeyboard> }
) {
  return callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: options?.replyMarkup
  });
}

export async function editMessageReplyMarkup(
  chatId: string | number,
  messageId: number,
  replyMarkup?: ReturnType<typeof inlineKeyboard>
) {
  return callTelegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup
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

// Окно, в течение которого несколько сообщений подряд в одном чате
// схлопываются в один редактируемый пуш вместо потока отдельных сообщений
// (см. TelegramChatPush в schema.prisma). После паузы длиннее окна следующее
// сообщение снова начинает свежий пуш со счётчиком 1.
const CHAT_PUSH_COLLAPSE_WINDOW_MS = 10 * 60 * 1000;

// Пуш о новом сообщении в чате — в отличие от notifyUser, при частой
// переписке не шлёт сообщение на каждую реплику, а обновляет одно и то же
// (bump счётчика), пока собеседники не сделают паузу дольше
// CHAT_PUSH_COLLAPSE_WINDOW_MS. contextLabel — короткое описание чата
// (например, заказ и вторая сторона) для текста пуша.
export async function notifyChatMessage(recipientUserId: string, chatId: string, contextLabel: string, preview: string) {
  const user = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { telegramId: true, notificationPreference: true }
  });
  if (!user?.telegramId) return;
  if (user.notificationPreference === "platform") return;

  const text = (count: number) =>
    count > 1
      ? `Новые сообщения (${count}) в чате: ${contextLabel}\nПоследнее: ${preview}`
      : `Новое сообщение в чате: ${contextLabel}\n${preview}`;

  try {
    const existing = await prisma.telegramChatPush.findUnique({
      where: { chatId_recipientUserId: { chatId, recipientUserId } }
    });

    const isFresh = existing && Date.now() - existing.updatedAt.getTime() < CHAT_PUSH_COLLAPSE_WINDOW_MS;

    if (existing && isFresh) {
      const nextCount = existing.unreadCount + 1;
      await editMessageText(user.telegramId, existing.telegramMessageId, text(nextCount));
      await prisma.telegramChatPush.update({
        where: { id: existing.id },
        data: { unreadCount: nextCount }
      });
      return;
    }

    const sent = await sendTelegramMessage(user.telegramId, text(1));

    await prisma.telegramChatPush.upsert({
      where: { chatId_recipientUserId: { chatId, recipientUserId } },
      update: { telegramMessageId: sent.message_id, unreadCount: 1 },
      create: { chatId, recipientUserId, telegramMessageId: sent.message_id, unreadCount: 1 }
    });
  } catch (error) {
    console.error("notifyChatMessage failed", error);
  }
}

// Пуш о новой анкете/заказе в очереди модерации — с кнопками "Одобрить" и
// "Отклонить" прямо под сообщением, чтобы решение принималось не открывая
// сайт (см. обработку callback_data вида mod:<kind>:<id>:<decision> в
// app/api/telegram/webhook/route.ts). kind однозначно определяет, какую
// модель обновлять при нажатии.
export async function notifyModerationItem(kind: "creator" | "client" | "order", id: string, label: string) {
  const adminChatId = getSupportAdminChatId();
  if (!adminChatId) return;

  try {
    await sendTelegramMessage(adminChatId, `На модерации: ${label}`, {
      replyMarkup: inlineKeyboard([
        [
          { text: "✅ Одобрить", callback_data: `mod:${kind}:${id}:approve` },
          { text: "❌ Отклонить", callback_data: `mod:${kind}:${id}:reject` }
        ]
      ])
    });
  } catch (error) {
    console.error("notifyModerationItem failed", error);
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

export type BroadcastAudience = "all" | "creators" | "clients";

// Общий выбор получателей по аудитории — используется и
// POST /api/admin/telegram/broadcast (форма в веб-админке), и
// /broadcast прямо в боте (см. app/api/telegram/webhook/route.ts), чтобы
// оба канала рассылали одинаковому кругу людей одной и той же логикой.
export async function broadcastToAudience(audience: BroadcastAudience, text: string) {
  const users = await prisma.user.findMany({
    where:
      audience === "creators"
        ? { creatorProfile: { isNot: null } }
        : audience === "clients"
          ? { clientProfile: { isNot: null } }
          : {},
    select: { id: true }
  });

  return broadcastTelegram(
    users.map((item) => item.id),
    text
  );
}

// Только сообщения от этого чата (первый id из TELEGRAM_ADMIN_IDS) считаются
// админскими командами (/menu, /broadcast, нажатия на кнопки модерации) —
// иначе любой пользователь смог бы, зная синтаксис, дёргать эти команды.
export function isSupportAdminChat(chatId: string | number) {
  return getSupportAdminChatId() === String(chatId);
}
