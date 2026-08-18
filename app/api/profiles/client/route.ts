import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
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

const activateSchema = z.object({
  companyName: z.string().trim().min(2, "Укажите название компании").max(120),
  industry: z.string().trim().min(2, "Укажите сферу деятельности").max(120),
  contactName: z.string().trim().min(2, "Укажите контактное лицо").max(120)
});

// Активация роли заказчика на уже существующем аккаунте (см. комментарий у
// hasRole в lib/session.ts) — например, креатор, который хочет разместить
// свой первый заказ. В отличие от регистрации через /login, повторная
// Telegram-верификация не нужна: пользователь уже аутентифицирован в
// текущей сессии, форма короткая и вызывается прямо из кабинета (см.
// activateClientRole в PlatformShell.tsx).
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.clientProfile) throw new ApiError(409, "У вас уже есть карточка заказчика");

    const body = activateSchema.parse(await request.json());
    const flags = await getFeatureFlags();
    const status = flags.moderationRequired ? "MODERATION" : "APPROVED";

    const profile = await prisma.clientProfile.create({
      data: {
        userId: user.id,
        companyName: body.companyName,
        industry: body.industry,
        contactName: body.contactName,
        status,
        isApproved: !flags.moderationRequired
      }
    });

    return ok({ profile }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

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
