// "Тестовый" провайдер оплаты — нет реального эквайринга, но интерфейс
// (createTestPayment) сделан так, чтобы его было легко заменить на настоящий
// платёжный шлюз позже: в реальном провайдере статус SUCCEEDED выставлялся бы
// вебхуком, а не сразу в этой функции.
//
// Ключевая развилка — flags.paymentsRequired (см. lib/config.ts):
//   true  -> платёж создаётся в статусе CREATED (как будто ждём оплату),
//            и побочные эффекты (см. ниже) НЕ применяются.
//   false -> платёж сразу SUCCEEDED, эффекты применяются немедленно.
// Это позволяет прогонять весь продукт вообще без оплат на этапе демо/теста,
// просто переключив один флаг в админке.
import { CreatorStatus, OrderStatus, Payment, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/config";
import { ApiError } from "@/lib/api";
import { notifyModerationItem, sendInvoice } from "@/lib/telegram-bot";

type TestPaymentInput = {
  userId: string;
  clientProfileId?: string;
  creatorProfileId?: string;
  packageId?: string;
  orderId?: string;
  amountCents?: number;
};

// Общие для всех провайдеров побочные эффекты успешного платежа — вынесено
// из createTestPayment, чтобы Telegram-оплата (finalizeTelegramPayment ниже)
// применяла ровно ту же логику (одобрение анкеты/публикация заказа/выдача
// пакета), а не дублировала её.
async function applyPaymentSideEffects(payment: Payment) {
  const flags = await getFeatureFlags();

  if (payment.creatorProfileId) {
    const nextStatus = flags.moderationRequired ? CreatorStatus.MODERATION : CreatorStatus.APPROVED;
    await prisma.creatorProfile.update({
      where: { id: payment.creatorProfileId },
      data: {
        membershipPaid: true,
        status: nextStatus,
        isApproved: nextStatus === CreatorStatus.APPROVED
      }
    });
  }

  if (payment.clientProfileId && payment.packageId) {
    const selectedPackage = await prisma.package.findUnique({ where: { id: payment.packageId } });
    await prisma.clientProfile.update({
      where: { id: payment.clientProfileId },
      data: {
        activePackageId: payment.packageId,
        hasDatabaseAccess: selectedPackage?.databaseAccess ?? false
      }
    });
  }

  if (payment.orderId) {
    const order = await prisma.order.findUnique({ where: { id: payment.orderId } });
    if (order && order.status === OrderStatus.PAYMENT_PENDING) {
      const nextStatus = flags.moderationRequired ? OrderStatus.MODERATION : OrderStatus.PUBLISHED;
      await prisma.order.update({
        where: { id: payment.orderId },
        data: {
          status: nextStatus,
          publishedAt: nextStatus === OrderStatus.PUBLISHED ? new Date() : null
        }
      });
      if (nextStatus === OrderStatus.MODERATION) {
        await notifyModerationItem("order", order.id, `«${order.title}» — оплачен, ждёт модерации`);
      }
    }
  }
}

// Единая точка для всех трёх видов оплаты в продукте:
//   creatorProfileId -> оплата подписки/вступления креатора (см. PlatformShell:
//                        CreatorSubscription) — открывает видимость в ленте.
//   clientProfileId + packageId -> покупка пакета размещений заказчиком
//                        (1 или 3 вакансии, см. seed.ts) — даёт activePackageId
//                        и, если у пакета databaseAccess, доступ к базе.
//   orderId -> точечная оплата публикации ОДНОГО заказа (order_publish),
//                        снимает его с PAYMENT_PENDING.
// Побочные эффекты (обновление профиля/заказа) выполняются только при
// status === SUCCEEDED — то есть либо оплата отключена флагом, либо (в
// будущем, с реальным шлюзом) сюда придёт подтверждение от вебхука.
export async function createTestPayment(input: TestPaymentInput) {
  const flags = await getFeatureFlags();
  const status = flags.paymentsRequired ? PaymentStatus.CREATED : PaymentStatus.SUCCEEDED;

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      clientProfileId: input.clientProfileId,
      creatorProfileId: input.creatorProfileId,
      packageId: input.packageId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      status,
      testPayload: {
        provider: "test",
        autoSucceeded: status === PaymentStatus.SUCCEEDED,
        featureFlag: flags.paymentsRequired ? "payments.required:on" : "payments.required:off"
      }
    }
  });

  if (status === PaymentStatus.SUCCEEDED) {
    await applyPaymentSideEffects(payment);
  }

  return payment;
}

type TelegramInvoiceInput = TestPaymentInput & {
  telegramId: string;
  title: string;
  description: string;
};

// Создаёт Payment(provider=TELEGRAM, status=CREATED) и сразу шлёт пользователю
// в Telegram настоящий инвойс (sendInvoice) — payment.id используется как
// invoice_payload, чтобы потом (в finalizeTelegramPayment, вызывается из
// вебхука на successful_payment) однозначно найти, какой именно платёж
// подтверждён. Требует настроенного TELEGRAM_PAYMENT_PROVIDER_TOKEN (см.
// комментарий у sendInvoice в lib/telegram-bot.ts) — вызывающий роут должен
// сам скрывать кнопку "Оплатить через Telegram", если токена нет.
export async function createTelegramInvoicePayment(input: TelegramInvoiceInput) {
  if (!input.amountCents) throw new ApiError(400, "amountCents is required for a Telegram invoice");

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      clientProfileId: input.clientProfileId,
      creatorProfileId: input.creatorProfileId,
      packageId: input.packageId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      provider: "TELEGRAM",
      status: PaymentStatus.CREATED
    }
  });

  await sendInvoice({
    chatId: input.telegramId,
    title: input.title,
    description: input.description,
    payload: payment.id,
    currency: "RUB",
    amountMinorUnits: input.amountCents,
    label: input.title
  });

  return payment;
}

// Вызывается из app/api/telegram/webhook/route.ts при апдейте с
// message.successful_payment. invoicePayload — это payment.id, который мы
// сами положили в payload при создании инвойса выше.
export async function finalizeTelegramPayment(input: {
  telegramId: string;
  invoicePayload: string;
  providerChargeId: string;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: input.invoicePayload } });
  if (!payment || payment.provider !== "TELEGRAM") return null;
  if (payment.status === PaymentStatus.SUCCEEDED) return payment; // повторный апдейт — идемпотентно

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.SUCCEEDED,
      testPayload: { telegramChargeId: input.providerChargeId }
    }
  });

  await applyPaymentSideEffects(updated);
  return updated;
}
