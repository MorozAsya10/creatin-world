import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  companyName: z.string().min(2),
  website: z.string().optional(),
  industry: z.string().min(2),
  description: z.string().optional(),
  contactName: z.string().min(2),
  contactTitle: z.string().optional(),
  legalType: z.string().optional(),
  inn: z.string().optional(),
  email: z.string().email().or(z.literal("")).optional()
});

// Карточка компании ("расширенная анкета" заказчика). В отличие от
// креатора, у заказчика нет шага PAYMENT_PENDING на этом этапе — сохранение
// сразу ведёт либо на модерацию, либо в APPROVED.
export async function PUT(request: Request) {
  try {
    const user = await requireUser([Role.CLIENT]);
    const body = schema.parse(await request.json());
    const flags = await getFeatureFlags();
    const { email, ...profileData } = body;
    const profile = await prisma.$transaction(async (tx) => {
      if (email !== undefined) {
        await tx.user.update({
          where: { id: user.id },
          data: { email: email || null }
        });
      }

      const status = flags.moderationRequired ? "MODERATION" : "APPROVED";

      return tx.clientProfile.update({
        where: { userId: user.id },
        data: {
          ...profileData,
          status,
          isApproved: !flags.moderationRequired
        }
      });
    });

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}
