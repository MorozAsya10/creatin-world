import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { createTelegramInvoicePayment } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Оплата через Telegram Payments — то же покрытие целей, что и
// /api/payments/test (см. подробный комментарий в lib/payments.ts), но вместо
// немедленного SUCCEEDED здесь шлётся настоящий sendInvoice, а подтверждение
// приходит асинхронно через app/api/telegram/webhook (successful_payment).
// Требует TELEGRAM_PAYMENT_PROVIDER_TOKEN на сервере — если его нет, фронт
// не должен даже показывать кнопку (см. bootstrap.telegramPaymentsEnabled).
const paymentSchema = z.object({
  purpose: z.enum(["creator_membership", "client_package", "order_publish"]),
  packageId: z.string().optional(),
  orderId: z.string().optional(),
  amountCents: z.number().int().positive().optional()
});

export async function POST(request: Request) {
  try {
    if (!process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN) {
      throw new ApiError(503, "Оплата через Telegram сейчас недоступна");
    }

    const user = await requireUser([Role.CREATOR, Role.CLIENT, Role.ADMIN]);
    const body = paymentSchema.parse(await request.json());

    if (body.purpose === "creator_membership") {
      if (!user.creatorProfile) throw new ApiError(400, "Creator profile is required");
      const payment = await createTelegramInvoicePayment({
        userId: user.id,
        telegramId: user.telegramId,
        creatorProfileId: user.creatorProfile.id,
        amountCents: body.amountCents,
        title: "Подписка креатора CREATIN.WORLD",
        description: "Открывает профиль в ленте и снимает ограничения на контакты и отклики."
      });
      return ok({ payment }, { status: 201 });
    }

    if (body.purpose === "order_publish") {
      if (!body.orderId) throw new ApiError(400, "orderId is required");
      const order = await prisma.order.findUnique({ where: { id: body.orderId } });
      if (!order) throw new ApiError(404, "Заказ не найден");
      if (user.clientProfile && order.clientProfileId !== user.clientProfile.id) {
        throw new ApiError(403, "Заказ не принадлежит вашей компании");
      }
      if (order.status !== "PAYMENT_PENDING") {
        throw new ApiError(409, "Заказ не ожидает оплаты");
      }

      const payment = await createTelegramInvoicePayment({
        userId: user.id,
        telegramId: user.telegramId,
        clientProfileId: order.clientProfileId,
        orderId: order.id,
        amountCents: body.amountCents,
        title: "Публикация заказа",
        description: `Публикация «${order.title}» в открытой ленте.`
      });
      return ok({ payment }, { status: 201 });
    }

    if (!body.packageId) throw new ApiError(400, "packageId is required");
    const selectedPackage = await prisma.package.findUnique({ where: { id: body.packageId } });
    if (!selectedPackage) throw new ApiError(404, "Package not found");
    if (!user.clientProfile) throw new ApiError(400, "Client profile is required");

    const payment = await createTelegramInvoicePayment({
      userId: user.id,
      telegramId: user.telegramId,
      clientProfileId: user.clientProfile.id,
      packageId: selectedPackage.id,
      amountCents: selectedPackage.priceCents || body.amountCents,
      title: selectedPackage.title,
      description: selectedPackage.description
    });

    return ok({ payment }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
