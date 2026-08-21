import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  answerCallbackQuery,
  answerPreCheckoutQuery,
  broadcastToAudience,
  copyMessage,
  editMessageReplyMarkup,
  editMessageText,
  forwardMessage,
  getSupportAdminChatId,
  inlineKeyboard,
  isSupportAdminChat,
  notifyUser,
  sendTelegramMessage,
  type BroadcastAudience
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
//
// ВАЖНО (см. пункт 0 в creatin_world_audit_1.md): раньше при отсутствующем
// TELEGRAM_WEBHOOK_SECRET этот эндпоинт молча принимал ЛЮБОЙ POST как
// настоящий апдейт от Telegram — включая поддельный successful_payment,
// который finalizeTelegramPayment превращал в бесплатную подписку/пакет.
// Теперь при не настроенном секрете запрос явно отклоняется (503), а не
// тихо пропускается — ошибка конфигурации становится видимой сразу.
function verifySecret(request: NextRequest): { ok: boolean; configured: boolean } {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return { ok: false, configured: false };
  return { ok: request.headers.get("x-telegram-bot-api-secret-token") === expected, configured: true };
}

const menuKeyboard = inlineKeyboard([
  [{ text: "Открыть кабинет", url: process.env.APP_URL || "https://creatin.world" }],
  [{ text: "Поддержка", callback_data: "support:start" }],
  [{ text: "Уведомления вкл/выкл", callback_data: "notify:toggle" }]
]);

// Отдельное меню для админского чата (см. isSupportAdminChat) — по кнопке, а
// не автоматическими пушами, чтобы не заваливать чат сообщениями (см. запрос
// "не хочется, чтобы всё валилось в кучу"): очередь модерации подтягивается
// по требованию, а не только когда появляется новый элемент.
const adminMenuKeyboard = inlineKeyboard([
  [{ text: "🗂 Очередь модерации", callback_data: "admin:moderation" }],
  [{ text: "📨 Рассылка", callback_data: "admin:broadcast" }]
]);

const audienceKeyboard = inlineKeyboard([
  [
    { text: "Все", callback_data: "broadcast:all" },
    { text: "Креаторы", callback_data: "broadcast:creators" },
    { text: "Заказчики", callback_data: "broadcast:clients" }
  ]
]);

const audienceLabels: Record<BroadcastAudience, string> = {
  all: "Все",
  creators: "Креаторы",
  clients: "Заказчики"
};

async function handleStart(chatId: string) {
  const isAdmin = isSupportAdminChat(chatId);
  await sendTelegramMessage(
    chatId,
    "Привет! Это бот CREATIN.WORLD.\n\n— «Открыть кабинет» — перейти на сайт.\n— «Поддержка» — написать нам, ответим прямо здесь.\n— «Уведомления вкл/выкл» — получать ли пуши о заказах и откликах в этот чат." +
      (isAdmin ? "\n\nВы админ-чат: команда /menu откроет админ-меню." : ""),
    { replyMarkup: menuKeyboard }
  );
}

// Пересылаем в поддержку ЛЮБОЕ сообщение пользователя — не только текст.
// Раньше проверялось только message.text, из-за чего фото/файлы/голосовые
// молча пропадали (forwardMessage их пересылает штатно, проблема была
// только в условии, которое решало, вызывать ли его вообще).
async function handleSupportIncoming(telegramId: string, chatId: string, messageId: number) {
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
// Ответ может быть текстом ИЛИ медиа (фото/файл/голосовое) — для медиа
// используем copyMessage (см. lib/telegram-bot.ts), чтобы у пользователя
// сообщение выглядело как обычное, а не "Forwarded from <личный аккаунт
// админа>". Раньше тут проверялся только text, из-за чего ответ фото/файлом
// молча пропадал.
async function handleSupportReply(
  adminChatId: string,
  replyToMessageId: number,
  reply: { message_id: number; text?: string }
) {
  const thread = await prisma.telegramSupportThread.findUnique({
    where: { adminChatId_adminMessageId: { adminChatId, adminMessageId: replyToMessageId } },
    include: { user: true }
  });
  if (!thread) return false;

  // Прямой ответ на вопрос пользователя — доставляем всегда, независимо от
  // notificationPreference (это не рассылка, а ответ на его же обращение).
  if (reply.text) {
    await sendTelegramMessage(thread.user.telegramId, `Ответ поддержки:\n${reply.text}`);
  } else {
    await sendTelegramMessage(thread.user.telegramId, "Ответ поддержки:");
    await copyMessage(thread.user.telegramId, adminChatId, reply.message_id);
  }
  return true;
}

type IncomingMessage = {
  text?: string;
  photo?: unknown;
  document?: unknown;
  voice?: unknown;
  video?: unknown;
  video_note?: unknown;
  sticker?: unknown;
  audio?: unknown;
};

// Общая проверка "есть что переслать в поддержку" — текст (не команда) или
// любое медиа. Используется и для входящих сообщений пользователя, и для
// ответов админа (Reply), чтобы фото/файлы обрабатывались одинаково в обе
// стороны.
function hasSupportableContent(message: IncomingMessage) {
  return Boolean(
    (message.text && !message.text.startsWith("/")) ||
      message.photo ||
      message.document ||
      message.voice ||
      message.video ||
      message.video_note ||
      message.sticker ||
      message.audio
  );
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

// Текущая очередь модерации по требованию (команда/кнопка), а не только
// пушами по факту появления — так админ сама решает, когда разбирать пачку,
// вместо того чтобы это само сыпалось в чат.
async function sendModerationQueue(chatId: string) {
  const [creators, clients, orders] = await Promise.all([
    prisma.creatorProfile.findMany({ where: { status: "MODERATION" }, select: { id: true, firstName: true, lastName: true } }),
    prisma.clientProfile.findMany({ where: { status: "MODERATION" }, select: { id: true, companyName: true } }),
    prisma.order.findMany({ where: { status: "MODERATION" }, select: { id: true, title: true } })
  ]);

  const total = creators.length + clients.length + orders.length;
  if (!total) {
    await sendTelegramMessage(chatId, "Очередь модерации пуста 🎉");
    return;
  }

  await sendTelegramMessage(chatId, `В очереди: ${total}. Разбираем по одному:`);

  for (const creator of creators) {
    await sendTelegramMessage(chatId, `Креатор: ${creator.firstName} ${creator.lastName}`, {
      replyMarkup: inlineKeyboard([
        [
          { text: "✅ Одобрить", callback_data: `mod:creator:${creator.id}:approve` },
          { text: "❌ Отклонить", callback_data: `mod:creator:${creator.id}:reject` }
        ]
      ])
    });
  }
  for (const client of clients) {
    await sendTelegramMessage(chatId, `Заказчик: ${client.companyName}`, {
      replyMarkup: inlineKeyboard([
        [
          { text: "✅ Одобрить", callback_data: `mod:client:${client.id}:approve` },
          { text: "❌ Отклонить", callback_data: `mod:client:${client.id}:reject` }
        ]
      ])
    });
  }
  for (const order of orders) {
    await sendTelegramMessage(chatId, `Заказ: «${order.title}»`, {
      replyMarkup: inlineKeyboard([
        [
          { text: "✅ Опубликовать", callback_data: `mod:order:${order.id}:approve` },
          { text: "❌ Отклонить", callback_data: `mod:order:${order.id}:reject` }
        ]
      ])
    });
  }
}

// Само решение по кнопке "Одобрить/Отклонить" — та же логика, что и в
// app/api/admin/creators/[id], admin/clients/[id], orders/[id] (PATCH), но
// вызванная прямо из вебхука, без похода через HTTP на собственный же API.
async function applyModerationDecision(
  kind: "creator" | "client" | "order",
  id: string,
  decision: "approve" | "reject",
  adminTelegramId: string
) {
  const admin = await prisma.user.findFirst({ where: { telegramId: adminTelegramId, role: Role.ADMIN } });

  if (kind === "creator") {
    const status = decision === "approve" ? "APPROVED" : "REJECTED";
    const profile = await prisma.creatorProfile.update({
      where: { id },
      data: { status, isApproved: decision === "approve" }
    });
    await prisma.auditLog.create({
      data: { actorId: admin?.id, action: `creator.${status.toLowerCase()}`, entity: "CreatorProfile", entityId: id }
    });
    await notifyUser(profile.userId, decision === "approve" ? "Ваша анкета креатора одобрена!" : "Ваша анкета креатора отклонена модерацией.");
    return `${profile.firstName} ${profile.lastName}`;
  }

  if (kind === "client") {
    const status = decision === "approve" ? "APPROVED" : "REJECTED";
    const profile = await prisma.clientProfile.update({
      where: { id },
      data: { status, isApproved: decision === "approve" }
    });
    await prisma.auditLog.create({
      data: { actorId: admin?.id, action: `client.${status.toLowerCase()}`, entity: "ClientProfile", entityId: id }
    });
    await notifyUser(profile.userId, decision === "approve" ? "Ваша анкета заказчика одобрена!" : "Ваша анкета заказчика отклонена модерацией.");
    return profile.companyName;
  }

  const existing = await prisma.order.findUnique({ where: { id }, include: { clientProfile: { select: { userId: true } } } });
  if (!existing) return null;
  const status = decision === "approve" ? "PUBLISHED" : "REJECTED";
  const order = await prisma.order.update({
    where: { id },
    data: { status, publishedAt: decision === "approve" ? new Date() : existing.publishedAt }
  });
  await prisma.auditLog.create({
    data: { actorId: admin?.id, action: `order.${status.toLowerCase()}`, entity: "Order", entityId: id }
  });
  await notifyUser(
    existing.clientProfile.userId,
    decision === "approve" ? `Заказ «${order.title}» опубликован и виден исполнителям.` : `Заказ «${order.title}» отклонён модерацией.`
  );
  return order.title;
}

export async function POST(request: NextRequest) {
  const secret = verifySecret(request);
  if (!secret.ok) {
    if (!secret.configured) {
      // Явная ошибка конфигурации, а не тихий пропуск — см. комментарий у
      // verifySecret. 503, а не 401/200, чтобы это было заметно в логах
      // Render и не выглядело как штатный ответ.
      console.error("TELEGRAM_WEBHOOK_SECRET не задан — вебхук отклонён. Настройте секрет в Render и передайте его в setWebhook.");
      return ok({ ok: false, error: "webhook secret is not configured" }, { status: 503 });
    }
    return ok({ ok: true }, { status: 401 });
  }

  try {
    const update = (await request.json()) as Record<string, unknown>;

    const callbackQuery = update.callback_query as
      | { id: string; data?: string; from?: { id: number }; message?: { chat: { id: number }; message_id: number; text?: string } }
      | undefined;
    if (callbackQuery?.data && callbackQuery.message) {
      const chatId = String(callbackQuery.message.chat.id);
      const telegramId = String(callbackQuery.from?.id ?? callbackQuery.message.chat.id);
      const messageId = callbackQuery.message.message_id;
      const data = callbackQuery.data;

      if (data === "support:start") {
        await answerCallbackQuery(callbackQuery.id);
        await sendTelegramMessage(chatId, "Напишите ваш вопрос одним сообщением — мы ответим прямо здесь.");
      } else if (data === "notify:toggle") {
        await handleNotifyToggle(telegramId, chatId, callbackQuery.id);
      } else if (data === "admin:moderation" && isSupportAdminChat(chatId)) {
        await answerCallbackQuery(callbackQuery.id);
        await sendModerationQueue(chatId);
      } else if (data === "admin:broadcast" && isSupportAdminChat(chatId)) {
        await answerCallbackQuery(callbackQuery.id);
        await sendTelegramMessage(chatId, "Кому отправить?", { replyMarkup: audienceKeyboard });
      } else if (data.startsWith("broadcast:") && isSupportAdminChat(chatId)) {
        const audience = data.slice("broadcast:".length) as BroadcastAudience;
        await answerCallbackQuery(callbackQuery.id);
        // Убираем кнопки у сообщения-запроса аудитории и просим ответить
        // (Reply) текстом рассылки на НОВОЕ сообщение — его текст содержит
        // распознаваемый маркер "Аудитория: ...", по которому при получении
        // ответа (см. ниже, reply_to_message) понимаем, кому слать.
        await editMessageReplyMarkup(chatId, messageId);
        await sendTelegramMessage(
          chatId,
          `📨 Аудитория: ${audienceLabels[audience]}\nОтветьте (Reply) на это сообщение текстом рассылки.`
        );
      } else if (data.startsWith("mod:") && isSupportAdminChat(chatId)) {
        const parts = data.split(":");
        const kind = parts[1] as "creator" | "client" | "order";
        const id = parts[2];
        const decision = parts[3] as "approve" | "reject";
        await answerCallbackQuery(callbackQuery.id, decision === "approve" ? "Одобрено" : "Отклонено");
        const label = await applyModerationDecision(kind, id, decision, telegramId);
        const resultText = label
          ? `${callbackQuery.message.text || ""}\n\n${decision === "approve" ? "✅ Одобрено" : "❌ Отклонено"}`
          : "Не найдено (возможно, уже обработано).";
        await editMessageText(chatId, messageId, resultText);
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
      | (IncomingMessage & {
          message_id: number;
          chat: { id: number };
          from?: { id: number };
          reply_to_message?: { message_id: number; text?: string };
          successful_payment?: { invoice_payload: string; telegram_payment_charge_id: string };
        })
      | undefined;

    if (message) {
      const chatId = String(message.chat.id);
      const telegramId = message.from ? String(message.from.id) : chatId;
      const isAdminChat = isSupportAdminChat(chatId);

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

      if (message.text === "/menu" && isAdminChat) {
        await sendTelegramMessage(chatId, "Админ-меню:", { replyMarkup: adminMenuKeyboard });
        return ok({ ok: true });
      }

      if (message.text === "/broadcast" && isAdminChat) {
        await sendTelegramMessage(chatId, "Кому отправить?", { replyMarkup: audienceKeyboard });
        return ok({ ok: true });
      }

      // Reply на наше собственное сообщение-запрос аудитории ("📨 Аудитория:
      // ..."): парсим аудиторию из текста ТОГО сообщения (а не храним
      // отдельное состояние в БД) и сразу рассылаем.
      if (isAdminChat && message.reply_to_message?.text && message.text) {
        const match = message.reply_to_message.text.match(/^📨 Аудитория: (Все|Креаторы|Заказчики)/);
        if (match) {
          const audience = (Object.entries(audienceLabels).find(([, label]) => label === match[1])?.[0] ||
            "all") as BroadcastAudience;
          const result = await broadcastToAudience(audience, message.text);
          await sendTelegramMessage(
            chatId,
            `Отправлено: ${result.sent}${result.failed ? `, не доставлено: ${result.failed}` : ""}.`
          );
          return ok({ ok: true });
        }
      }

      // Ответ админа на пересланный вопрос поддержки: чат — админский,
      // сообщение — Reply на пересланное сообщение пользователя. Реагируем и
      // на текст, и на медиа (фото/файл/голосовое) — раньше отвечало только
      // текстом, и ответ фото/файлом молча пропадал.
      if (isAdminChat && message.reply_to_message && hasSupportableContent(message)) {
        const handled = await handleSupportReply(chatId, message.reply_to_message.message_id, {
          message_id: message.message_id,
          text: message.text
        });
        if (handled) return ok({ ok: true });
      }

      // Админский чат сам ничего не создаёт как "вопрос в поддержку" (иначе
      // любое служебное сообщение админа улетало бы самому себе).
      if (isAdminChat) return ok({ ok: true });

      if (hasSupportableContent(message)) {
        await handleSupportIncoming(telegramId, chatId, message.message_id);
        return ok({ ok: true });
      }
    }

    return ok({ ok: true });
  } catch (error) {
    console.error("telegram webhook failed", error);
    return ok({ ok: true });
  }
}
