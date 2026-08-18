import { Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { refreshCreatorScore } from "@/lib/rating";
import { requireUser } from "@/lib/session";

const activateSchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя").max(60),
  lastName: z.string().trim().min(1, "Укажите фамилию").max(60),
  category: z.string().trim().min(2, "Выберите категорию"),
  primaryRole: z.string().trim().min(2, "Укажите специализацию"),
  experienceYears: z.coerce.number().int().min(0).max(60)
});

// Активация роли креатора на уже существующем аккаунте — симметрично
// POST /api/profiles/client (см. её комментарий). Например, заказчик,
// который хочет тоже откликаться на заказы как исполнитель.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.creatorProfile) throw new ApiError(409, "У вас уже есть анкета креатора");

    const body = activateSchema.parse(await request.json());
    const flags = await getFeatureFlags();
    const status = flags.moderationRequired ? "MODERATION" : flags.paymentsRequired ? "PAYMENT_PENDING" : "APPROVED";
    const isApproved = !flags.moderationRequired && !flags.paymentsRequired;

    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        firstName: body.firstName,
        lastName: body.lastName,
        category: body.category,
        primaryRole: body.primaryRole,
        level: "Middle",
        experienceYears: body.experienceYears,
        expertise: [],
        bio: "Анкета заполнена частично при активации роли. Остальные поля можно дополнить в кабинете.",
        workFormat: "Проект",
        availability: "available",
        minBudget: 0,
        telegramContact: user.telegramUsername ? `@${user.telegramUsername}` : null,
        status,
        moderationStage: "REGISTRATION",
        membershipPaid: false,
        isApproved,
        score: 70
      }
    });

    await refreshCreatorScore(profile.id);

    return ok({ profile }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  city: z.string().optional(),
  category: z.string().min(2),
  primaryRole: z.string().min(2),
  level: z.string().min(2),
  experienceYears: z.number().int().min(0),
  expertise: z.array(z.string()).default([]),
  bio: z.string().min(10),
  portfolioUrl: z.string().optional(),
  cases: z.string().optional(),
  workFormat: z.string().min(2),
  availability: z.string().min(2),
  minBudget: z.number().int().min(0),
  hourlyRate: z.number().int().min(0).optional(),
  email: z.string().email().or(z.literal("")).optional()
});

// Расширенная анкета исполнителя (профессиональные поля: категория, роль,
// экспертиза, портфолио и т.д.) — заполняется в кабинете после регистрации.
// Статус пересчитывается заново при каждом сохранении, но membershipPaid
// сохраняется как есть: подписка не "сбрасывается" из-за правки анкеты.
export async function PUT(request: Request) {
  try {
    const user = await requireUser([Role.CREATOR]);
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

      const membershipPaid = Boolean(user.creatorProfile?.membershipPaid);
      const paymentPending = flags.paymentsRequired && !membershipPaid;
      const status = flags.moderationRequired
        ? "MODERATION"
        : paymentPending
          ? "PAYMENT_PENDING"
          : "APPROVED";

      return tx.creatorProfile.update({
        where: { userId: user.id },
        data: {
          ...profileData,
          status,
          // Эта форма — расширенная анкета исполнителя (доступна только уже
          // одобренному креатору), в отличие от мини-анкеты при регистрации.
          moderationStage: "PROFILE",
          isApproved: !flags.moderationRequired && !paymentPending
        }
      });
    });

    // Заполненность анкеты — один из компонентов индекса (см. lib/rating.ts),
    // поэтому пересчитываем сразу после сохранения профиля.
    await refreshCreatorScore(profile.id);

    return ok({ profile });
  } catch (error) {
    return fail(error);
  }
}
