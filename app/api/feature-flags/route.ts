import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// GET открыт всем (фронту нужно знать флаги ещё до логина, например чтобы
// показать правильный текст кнопки на /login). PUT — только админ, меняет
// флаги "на лету" через FeatureFlag в БД (см. lib/config.ts::getFeatureFlags).
const schema = z.object({
  paymentsRequired: z.boolean().optional(),
  moderationRequired: z.boolean().optional(),
  aiExternalRequired: z.boolean().optional()
});

const map = {
  paymentsRequired: {
    key: "payments.required",
    description: "Доступ открывается только после подтверждения оплаты."
  },
  moderationRequired: {
    key: "moderation.required",
    description: "Если включено, анкеты и заказы требуют ручного решения администратора."
  },
  aiExternalRequired: {
    key: "ai.external_required",
    description: "При недоступности внешнего AI резервный подбор не используется."
  }
} as const;

export async function GET() {
  try {
    return ok({ flags: await getFeatureFlags() });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireUser([Role.ADMIN]);
    const body = schema.parse(await request.json());

    await Promise.all(
      Object.entries(body).map(([flag, enabled]) => {
        const item = map[flag as keyof typeof map];
        return prisma.featureFlag.upsert({
          where: { key: item.key },
          update: { enabled: Boolean(enabled), description: item.description },
          create: {
            key: item.key,
            enabled: Boolean(enabled),
            description: item.description
          }
        });
      })
    );

    return ok({ flags: await getFeatureFlags() });
  } catch (error) {
    return fail(error);
  }
}
