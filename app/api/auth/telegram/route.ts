import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { normalizeTelegramUser, verifyTelegramPayload, type TelegramLoginPayload } from "@/lib/telegram";
import { setSessionCookie } from "@/lib/session";
import { notifyModerationItem } from "@/lib/telegram-bot";

const creatorRegistrationSchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя").max(60),
  lastName: z.string().trim().min(1, "Укажите фамилию").max(60),
  category: z.string().trim().min(2, "Выберите категорию"),
  primaryRole: z.string().trim().min(2, "Укажите роль"),
  experienceYears: z.coerce.number().int().min(0).max(60),
  portfolioUrl: z.string().trim().max(300).optional()
});

const clientRegistrationSchema = z.object({
  companyName: z.string().trim().min(2, "Укажите название компании").max(120),
  industry: z.string().trim().min(2, "Укажите сферу деятельности").max(120),
  contactName: z.string().trim().min(2, "Укажите контактное лицо").max(120)
});

// Профиль для уже существующего аккаунта, у которого он почему-то отсутствует
// (страховка для legacy-данных). Ничего не одобряет и не перезаписывает существующие анкеты.
async function ensureRoleProfile(userId: string, role: Role, telegramUsername?: string) {
  const flags = await getFeatureFlags();

  if (role === Role.CREATOR) {
    const status = flags.moderationRequired ? "MODERATION" : flags.paymentsRequired ? "PAYMENT_PENDING" : "APPROVED";
    const isApproved = !flags.moderationRequired && !flags.paymentsRequired;

    const profile = await prisma.creatorProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        firstName: "Новый",
        lastName: "Креатор",
        category: "Дизайн",
        primaryRole: "Специалист",
        level: "Middle",
        experienceYears: 0,
        expertise: [],
        bio: "Анкета ещё не заполнена.",
        workFormat: "Проект",
        availability: "available",
        minBudget: 0,
        telegramContact: telegramUsername ? `@${telegramUsername}` : null,
        status,
        moderationStage: "REGISTRATION",
        membershipPaid: false,
        isApproved,
        score: 70
      }
    });
    if (status === "MODERATION") {
      await notifyModerationItem("creator", profile.id, `${profile.firstName} ${profile.lastName} (вход/регистрация)`);
    }
  }

  if (role === Role.CLIENT) {
    const status = flags.moderationRequired ? "MODERATION" : "APPROVED";
    const isApproved = !flags.moderationRequired;

    const profile = await prisma.clientProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        companyName: "Новая компания",
        industry: "Не указано",
        contactName: "Не указано",
        status,
        isApproved
      }
    });
    if (status === "MODERATION") {
      await notifyModerationItem("client", profile.id, `${profile.companyName} (вход/регистрация)`);
    }
  }
}

// Профиль по данным мини-анкеты, заполненной на регистрации.
async function createRoleProfileFromRegistration(
  userId: string,
  role: Role,
  registration: unknown,
  telegramUsername?: string
) {
  const flags = await getFeatureFlags();

  if (role === Role.CREATOR) {
    const data = creatorRegistrationSchema.parse(registration || {});
    const status = flags.moderationRequired ? "MODERATION" : flags.paymentsRequired ? "PAYMENT_PENDING" : "APPROVED";
    const isApproved = !flags.moderationRequired && !flags.paymentsRequired;

    const profile = await prisma.creatorProfile.create({
      data: {
        userId,
        firstName: data.firstName,
        lastName: data.lastName,
        category: data.category,
        primaryRole: data.primaryRole,
        level: "Middle",
        experienceYears: data.experienceYears,
        expertise: [],
        bio: "Анкета заполнена частично при регистрации. Остальные поля можно дополнить в кабинете после одобрения.",
        portfolioUrl: data.portfolioUrl || null,
        workFormat: "Проект",
        availability: "available",
        minBudget: 0,
        telegramContact: telegramUsername ? `@${telegramUsername}` : null,
        status,
        moderationStage: "REGISTRATION",
        membershipPaid: false,
        isApproved,
        score: 70
      }
    });
    if (status === "MODERATION") {
      await notifyModerationItem("creator", profile.id, `${profile.firstName} ${profile.lastName} (регистрация)`);
    }
    return;
  }

  if (role === Role.CLIENT) {
    const data = clientRegistrationSchema.parse(registration || {});
    const status = flags.moderationRequired ? "MODERATION" : "APPROVED";
    const isApproved = !flags.moderationRequired;

    const profile = await prisma.clientProfile.create({
      data: {
        userId,
        companyName: data.companyName,
        industry: data.industry,
        contactName: data.contactName,
        status,
        isApproved
      }
    });
    if (status === "MODERATION") {
      await notifyModerationItem("client", profile.id, `${profile.companyName} (регистрация)`);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as TelegramLoginPayload;
    verifyTelegramPayload(payload);
    const normalized = normalizeTelegramUser(payload);

    const existing = await prisma.user.findUnique({
      where: { telegramId: normalized.telegramId },
      include: { creatorProfile: true, clientProfile: true }
    });

    const configuredAdminIds = new Set(
      (process.env.TELEGRAM_ADMIN_IDS || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    );
    const isDemoAdmin =
      process.env.TELEGRAM_AUTH_BYPASS === "true" && normalized.telegramId === "90001";
    const canCreateAdmin = configuredAdminIds.has(normalized.telegramId) || isDemoAdmin;

    if (normalized.role === Role.ADMIN && existing?.role !== Role.ADMIN && !canCreateAdmin) {
      throw new ApiError(403, "Этот Telegram-аккаунт не добавлен в список администраторов");
    }

    // Админский вход не проходит через регистрацию/модерацию: доступ определяется
    // списком TELEGRAM_ADMIN_IDS, а не мини-анкетой.
    const isAdminAccount = normalized.role === Role.ADMIN && (existing?.role === Role.ADMIN || canCreateAdmin);
    const mode = isAdminAccount ? "login" : payload.mode === "register" ? "register" : "login";

    if (mode === "login" && !existing) {
      throw new ApiError(404, "Аккаунт с этим Telegram не найден. Нажмите «Зарегистрироваться».");
    }

    // Один Telegram-аккаунт может завести и анкету креатора, и карточку
    // заказчика (см. hasRole в lib/session.ts) — поэтому "уже
    // зарегистрирован" означает не просто "user с таким telegramId
    // существует", а "у него уже есть профиль именно той роли, которую
    // сейчас просят зарегистрировать". Если профиль другой роли уже есть, а
    // этой ещё нет — это активация второй роли на существующем аккаунте, а
    // не дубль. (Основной путь для неё — кнопка в кабинете, см.
    // POST /api/profiles/{creator,client}; эта ветка — подстраховка, если
    // человек всё равно попал на /login и нажал «Зарегистрироваться».)
    const alreadyHasRequestedRole = existing
      ? normalized.role === Role.CREATOR
        ? Boolean(existing.creatorProfile)
        : normalized.role === Role.CLIENT
          ? Boolean(existing.clientProfile)
          : existing.role === Role.ADMIN
      : false;

    if (mode === "register" && alreadyHasRequestedRole) {
      throw new ApiError(409, "Этот Telegram-аккаунт уже зарегистрирован. Войдите через «Являюсь пользователем».");
    }

    // Баг был здесь: если у аккаунта уже была роль CREATOR/CLIENT (например,
    // человек раньше тестировал сайт под этим же Telegram), то при входе как
    // админ role оставался прежним (existing.role), несмотря на то что
    // canCreateAdmin/isAdminAccount выше уже разрешили сам вход — из-за этого
    // user.role никогда не становился ADMIN, а requireUser([Role.ADMIN])
    // (см. lib/session.ts) потом бросал 403 "Forbidden" при любом обращении
    // к /api/admin/**. Явно форсируем ADMIN для isAdminAccount.
    const role = isAdminAccount ? Role.ADMIN : existing?.role || normalized.role;
    const user = await prisma.user.upsert({
      where: { telegramId: normalized.telegramId },
      update: {
        telegramUsername: normalized.telegramUsername,
        name: normalized.name,
        role
      },
      create: {
        telegramId: normalized.telegramId,
        telegramUsername: normalized.telegramUsername,
        name: normalized.name,
        role
      }
    });

    if (mode === "register") {
      // Регистрируем именно запрошенную роль (normalized.role), а не
      // user.role — при активации второй роли на существующем аккаунте они
      // могут отличаться.
      await createRoleProfileFromRegistration(user.id, normalized.role, payload.registration, user.telegramUsername || undefined);
    } else {
      await ensureRoleProfile(user.id, user.role, user.telegramUsername || undefined);
    }

    await setSessionCookie(user);

    const withProfiles = await prisma.user.findUnique({
      where: { id: user.id },
      include: { creatorProfile: true, clientProfile: true }
    });

    return ok({ user: withProfiles });
  } catch (error) {
    return fail(error);
  }
}
