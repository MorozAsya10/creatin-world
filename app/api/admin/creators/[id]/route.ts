import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Ручное решение админа по анкете креатора, стоящей в очереди модерации
// (см. GET /api/admin/overview -> pendingCreators/pendingCreatorProfiles,
// разделены по CreatorProfile.moderationStage). Пишет AuditLog для истории.
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
    const existing = await prisma.creatorProfile.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Анкета не найдена");

    const profile = await prisma.creatorProfile.update({
      where: { id },
      data: {
        status,
        isApproved: status === "APPROVED"
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: status === "APPROVED" ? "creator.approved" : "creator.rejected",
        entity: "CreatorProfile",
        entityId: profile.id
      }
    });

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}
