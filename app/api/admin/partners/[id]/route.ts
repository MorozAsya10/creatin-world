import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const updateSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().trim().min(2).optional(),
  sponsorName: z.string().trim().min(2).optional(),
  description: z.string().trim().min(5).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  linkUrl: z.string().trim().min(4).optional(),
  position: z.number().int().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Плашка не найдена");

    const partner = await prisma.partner.update({
      where: { id },
      data: body
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "partner.updated",
        entity: "Partner",
        entityId: partner.id
      }
    });

    return ok({ partner });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const { id } = await params;
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Плашка не найдена");

    await prisma.partner.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "partner.deleted",
        entity: "Partner",
        entityId: id
      }
    });

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
