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
// Бюджетные корзины ровно те же границы, что раньше проверялись в JS
// (см. budgetMatches ниже в истории) — вынесены сюда, чтобы собрать из них
// Prisma-условие вместо фильтрации уже загруженного в память списка.
function budgetWhere(budget: string) {
  if (budget === "low") return { minBudget: { lt: 100000 } };
  if (budget === "mid") return { minBudget: { gte: 100000, lte: 200000 } };
  if (budget === "high") return { minBudget: { gt: 200000 } };
  return {};
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scope = params.get("scope") || "public";
    const category = params.get("category") || "Все";
    const level = params.get("level") || "";
    const workFormat = params.get("format") || "";
    const availability = params.get("availability") || "";
    const budget = params.get("budget") || "";
    const search = params.get("search") || "";

    // Пагинация опциональна (см. пункт "нет пагинации на /api/creators" в
    // creatin_world_audit_1.md): если page/pageSize не переданы — отдаём
    // весь отфильтрованный список одним ответом, как и раньше, чтобы не
    // ломать текущий контракт CreatorCatalog.tsx (он их пока не передаёт).
    // Когда фронт будет готов к постраничной подгрузке, достаточно начать
    // передавать эти параметры — API уже их поддерживает.
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : null;
    const pageSize = pageSizeParam ? Math.min(100, Math.max(1, parseInt(pageSizeParam, 10) || 24)) : 24;

    const where = {
      isApproved: true,
      ...(category !== "Все" ? { category } : {}),
      ...(level ? { level } : {}),
      ...(workFormat ? { workFormat } : {}),
      ...(availability ? { availability } : {}),
      ...budgetWhere(budget),
      // Свободный поиск раньше собирал все поля в одну строку и делал
      // .includes() уже после того как весь каталог был загружен в память —
      // теперь это OR по нескольким текстовым полям на уровне БД (ILIKE через
      // Prisma mode: "insensitive"). expertise — это String[], точечное
      // совпадение (`has`) вместо substring-поиска: небольшой компромисс, но
      // избавляет от full-scan таблицы на каждый ввод в строке поиска.
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { primaryRole: { contains: search, mode: "insensitive" as const } },
              { bio: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
              { expertise: { has: search } }
            ]
          }
        : {})
    };

    const [creators, total, recommendationRows, user, flags] = await Promise.all([
      prisma.creatorProfile.findMany({
        where,
        include: {
          user: true,
          files: true
        },
        orderBy: [{ score: "desc" }, { experienceYears: "desc" }],
        ...(page ? { skip: (page - 1) * pageSize, take: pageSize } : {})
      }),
      page ? prisma.creatorProfile.count({ where }) : Promise.resolve(null),
      // Плоский список оценённых откликов — считаем агрегаты в JS ниже, а не
      // через Prisma _count, потому что _count не умеет отдать одновременно
      // "всего оценок" и "из них положительных" по одной и той же связи с
      // разными where в одном select (см. комментарий у Application в schema.prisma).
      prisma.application.findMany({
        where: { clientRecommended: { not: null } },
        select: { creatorProfileId: true, clientRecommended: true }
      }),
      getCurrentUser(),
      getFeatureFlags()
    ]);

    const recommendationStats = new Map<string, { reviewed: number; recommended: number }>();
    for (const row of recommendationRows) {
      const stat = recommendationStats.get(row.creatorProfileId) || { reviewed: 0, recommended: 0 };
      stat.reviewed += 1;
      if (row.clientRecommended) stat.recommended += 1;
      recommendationStats.set(row.creatorProfileId, stat);
    }

    // На публичной странице каталога показываются только одобренные и оплатившие
    // подписку креаторы — сам факт присутствия в списке уже означает оплату,
    // поэтому контакты открыты без дополнительного пакета у зрителя.
    const canSeeContacts =
      scope === "public" ||
      user?.role === Role.ADMIN ||
      (Boolean(user?.clientProfile) &&
        (!flags.paymentsRequired || Boolean(user?.clientProfile?.hasDatabaseAccess)));

    return ok({
      creators: creators.map((creator) => {
        const stat = recommendationStats.get(creator.id);
        return {
          ...creator,
          telegramContact: canSeeContacts ? creator.telegramContact : null,
          user: canSeeContacts
            ? {
                telegramUsername: creator.user.telegramUsername
              }
            : undefined,
          reviewedOrdersCount: stat?.reviewed || 0,
          recommendedCount: stat?.recommended || 0
        };
      }),
      canSeeContacts,
      // total/page/pageSize присутствуют только если запрошена пагинация
      // (см. комментарий выше про необязательность page) — иначе фронт как
      // и раньше получает просто полный отфильтрованный список.
      ...(page ? { total, page, pageSize } : {})
    });
  } catch (error) {
    return fail(error);
  }
}
