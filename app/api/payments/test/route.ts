import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { createTestPayment } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Единственный эндпоинт для всех трёх видов оплаты в продукте (см. подробный
// комментарий в lib/payments.ts::createTestPayment, которая тут и вызывается
// после того как этот роут проверил права/принадлежность сущности).
const paymentSchema = z.object({
  purpose: z.enum(["creator_membership", "client_package", "order_publish"]),
  packageId: z.string().optional(),
  clientProfileId: z.string().optional(),
  orderId: z.string().optional(),
  amountCents: z.number().int().positive().optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser([Role.CREATOR, Role.CLIENT, Role.ADMIN]);
    const body = paymentSchema.parse(await request.json());

    if (body.purpose === "creator_membership") {
      if (!user.creatorProfile) throw new ApiError(400, "Creator profile is required");
      const payment = await createTestPayment({
        userId: user.id,
        creatorProfileId: user.creatorProfile.id,
        amountCents: body.amountCents
      });
      return ok({ payment }, { status: 201 });
    }

    if (body.purpose === "order_publish") {
      if (!body.orderId) throw new ApiError(400, "orderId is required");
      const order = await prisma.order.findUnique({ where: { id: body.orderId } });
      if (!order) throw new ApiError(404, "Заказ не найден");
      if (user.role === Role.CLIENT && order.clientProfileId !== user.clientProfile?.id) {
        throw new ApiError(403, "Заказ не принадлежит вашей компании");
      }
      if (order.status !== "PAYMENT_PENDING") {
        throw new ApiError(409, "Заказ не ожидает оплаты");
      }

      const payment = await createTestPayment({
        userId: user.id,
        clientProfileId: order.clientProfileId,
        orderId: order.id,
        amountCents: body.amountCents
      });
      return ok({ payment }, { status: 201 });
    }

    if (!body.packageId) throw new ApiError(400, "packageId is required");
    const selectedPackage = await prisma.package.findUnique({ where: { id: body.packageId } });
    if (!selectedPackage) throw new ApiError(404, "Package not found");

    const clientProfile =
      user.role === Role.CLIENT
        ? user.clientProfile
        : body.clientProfileId
          ? await prisma.clientProfile.findUnique({ where: { id: body.clientProfileId } })
          : null;

    if (!clientProfile) {
      throw new ApiError(400, user.role === Role.CLIENT ? "Client profile is required" : "Укажите clientProfileId");
    }

    const payment = await createTestPayment({
      userId: user.id,
      clientProfileId: clientProfile.id,
      packageId: selectedPackage.id,
      amountCents: selectedPackage.priceCents || body.amountCents
    });

    return ok({ payment }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
