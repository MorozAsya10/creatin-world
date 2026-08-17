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
import { CreatorStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/config";

type TestPaymentInput = {
  userId: string;
  clientProfileId?: string;
  creatorProfileId?: string;
  packageId?: string;
  orderId?: string;
  amountCents?: number;
};

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
    if (input.creatorProfileId) {
      const nextStatus = flags.moderationRequired ? CreatorStatus.MODERATION : CreatorStatus.APPROVED;
      await prisma.creatorProfile.update({
        where: { id: input.creatorProfileId },
        data: {
          membershipPaid: true,
          status: nextStatus,
          isApproved: nextStatus === CreatorStatus.APPROVED
        }
      });
    }

    if (input.clientProfileId && input.packageId) {
      const selectedPackage = await prisma.package.findUnique({ where: { id: input.packageId } });
      await prisma.clientProfile.update({
        where: { id: input.clientProfileId },
        data: {
          activePackageId: input.packageId,
          hasDatabaseAccess: selectedPackage?.databaseAccess ?? false
        }
      });
    }

    if (input.orderId) {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (order && order.status === OrderStatus.PAYMENT_PENDING) {
        const nextStatus = flags.moderationRequired ? OrderStatus.MODERATION : OrderStatus.PUBLISHED;
        await prisma.order.update({
          where: { id: input.orderId },
          data: {
            status: nextStatus,
            publishedAt: nextStatus === OrderStatus.PUBLISHED ? new Date() : null
          }
        });
      }
    }
  }

  return payment;
}
