import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Каталог креаторов с фильтрами, используется и на публичной /creators
// (scope=public — контакты открыты всем, см. комментарий ниже), и внутри
// кабинета заказчика (scope=client — контакты только с оплаченным пакетом
// databaseAccess). Возвращаемые поля креатора урезаются под canSeeContacts,
// а не просто скрываются на фронте — так контакты не утекают в сетевом ответе.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scope = params.get("scope") || "public";
    const category = params.get("category") || "Все";
    const level = params.get("level") || "";
    const workFormat = params.get("format") || "";
    const availability = params.get("availability") || "";
    const budget = params.get("budget") || "";
    const search = (params.get("search") || "").toLowerCase();

    const [creators, user, flags] = await Promise.all([
      prisma.creatorProfile.findMany({
      where: {
        isApproved: true,
        ...(category !== "Все" ? { category } : {}),
        ...(level ? { level } : {}),
        ...(workFormat ? { workFormat } : {}),
        ...(availability ? { availability } : {})
      },
      include: {
        user: true,
        files: true
      },
      orderBy: [{ score: "desc" }, { experienceYears: "desc" }]
      }),
      getCurrentUser(),
      getFeatureFlags()
    ]);

    // На публичной странице каталога показываются только одобренные и оплатившие
    // подписку креаторы — сам факт присутствия в списке уже означает оплату,
    // поэтому контакты открыты без дополнительного пакета у зрителя.
    const canSeeContacts =
      scope === "public" ||
      user?.role === Role.ADMIN ||
      (user?.role === Role.CLIENT &&
        (!flags.paymentsRequired || Boolean(user.clientProfile?.hasDatabaseAccess)));

    const filtered = creators.filter((creator) => {
      const budgetMatches =
        !budget ||
        (budget === "low" && creator.minBudget < 100000) ||
        (budget === "mid" && creator.minBudget >= 100000 && creator.minBudget <= 200000) ||
        (budget === "high" && creator.minBudget > 200000);

      const haystack = [
        creator.firstName,
        creator.lastName,
        creator.primaryRole,
        creator.bio,
        creator.category,
        creator.expertise.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return budgetMatches && (!search || haystack.includes(search));
    });

    return ok({
      creators: filtered.map((creator) => ({
        ...creator,
        telegramContact: canSeeContacts ? creator.telegramContact : null,
        user: canSeeContacts
          ? {
              telegramUsername: creator.user.telegramUsername
            }
          : undefined
      })),
      canSeeContacts
    });
  } catch (error) {
    return fail(error);
  }
}
