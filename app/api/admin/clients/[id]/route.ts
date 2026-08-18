import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { notifyUser } from "@/lib/telegram-bot";

// Ручное решение админа по анкете заказчика, стоящей в очереди модерации
// (см. GET /api/admin/overview -> pendingClients). Пишет AuditLog для истории.
const schema = z.object({
  status: z.enum(["APPROVED", "REJECTED"])
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const { id } = await params;
    const { status } = schema.parse(await request.json());
    const existing = await prisma.clientProfile.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new ApiError(404, "Анкета не найдена");

    const profile = await prisma.clientProfile.update({
      where: { id },
      data: {
        status,
        isApproved: status === "APPROVED"
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: status === "APPROVED" ? "client.approved" : "client.rejected",
        entity: "ClientProfile",
        entityId: profile.id
      }
    });

    await notifyUser(
      existing.userId,
      status === "APPROVED" ? "Ваша анкета заказчика одобрена!" : "Ваша анкета заказчика отклонена модерацией."
    );

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}
