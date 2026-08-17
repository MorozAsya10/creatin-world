import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Партнёрские плашки публикуются только вручную из админки (см. комментарий
// у model Partner в schema.prisma) — креатор и заказчик не имеют доступа к
// этому роуту. Публичный список без авторизации отдаёт /api/partners.
const createSchema = z.object({
  title: z.string().trim().min(2, "Укажите заголовок"),
  sponsorName: z.string().trim().min(2, "Укажите название партнёра"),
  description: z.string().trim().min(5, "Добавьте короткое описание"),
  imageUrl: z.string().trim().max(500).optional(),
  linkUrl: z.string().trim().min(4, "Укажите ссылку"),
  position: z.number().int().optional()
});

export async function GET() {
  try {
    await requireUser([Role.ADMIN]);
    const partners = await prisma.partner.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "desc" }]
    });

    return ok({ partners });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireUser([Role.ADMIN]);
    const body = createSchema.parse(await request.json());

    const partner = await prisma.partner.create({
      data: {
        title: body.title,
        sponsorName: body.sponsorName,
        description: body.description,
        imageUrl: body.imageUrl || null,
        linkUrl: body.linkUrl,
        position: body.position ?? 0
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "partner.created",
        entity: "Partner",
        entityId: partner.id
      }
    });

    return ok({ partner }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
