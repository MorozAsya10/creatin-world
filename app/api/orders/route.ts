import { NextRequest } from "next/server";
import { type Order, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { ok, fail, ApiError } from "@/lib/api";
import { getFeatureFlags } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/session";

// Верхние границы — по мотивам обсуждения на планировании (ориентир —
// "средняя температура по больнице" у HeadHunter и подобных): описание не
// должно превращаться в простыню. Дублируются maxLength'ом на форме
// (NewOrderPane в components/platform/PlatformShell.tsx), но финальная
// проверка — здесь, на бэке.
const createOrderSchema = z.object({
  title: z.string().min(3).max(150),
  category: z.string().min(2),
  description: z.string().min(10).max(6000),
  requirements: z.string().min(3).max(3000),
  budget: z.string().min(2).max(120),
  deadline: z.string().min(2).max(120),
  initiator: z.enum(["CLIENT", "CREATOR"]).default("CLIENT"),
  clientProfileId: z.string().cuid().optional(),
  // Вакансия — одна позиция (дублирует title, см. ниже), заказчик её не
  // задаёт руками. Проект — заказчик перечисляет названия позиций сам
  // (для сборки команды из нескольких специалистов под одним постом).
  kind: z.enum(["VACANCY", "PROJECT"]).default("VACANCY"),
  positions: z.array(z.string().trim().min(2).max(120)).max(20).optional(),
  acceptsVolunteers: z.boolean().default(false)
});

// Человекочитаемый ID заказа вида ORD-022 (в дополнение к cuid) — берётся
// максимум по всем существующим и + 1; стартовая база 21, чтобы новые заказы
// продолжали нумерацию демо-заказов из seed.ts, а не начинались заново с 1.
async function nextPublicId() {
  const orders = await prisma.order.findMany({ select: { publicId: true } });
  const maxNumber = orders.reduce((max, order) => {
    const number = Number(order.publicId.match(/^ORD-(\d+)$/)?.[1] || 0);
    return Math.max(max, number);
  }, 21);

  return `ORD-${String(maxNumber + 1).padStart(3, "0")}`;
}

// nextPublicId() читает "текущий максимум", поэтому при параллельных
// запросах два заказа теоретически могут посчитать один и тот же publicId —
// в этом случае вторая вставка упадёт по уникальному индексу (P2002), и
// здесь мы просто пересчитываем ID и повторяем (до 5 попыток).
async function createOrderWithUniquePublicId(
  data: Omit<Prisma.OrderUncheckedCreateInput, "publicId">,
  attempt = 1
): Promise<Order> {
  try {
    return await prisma.order.create({ data: { ...data, publicId: await nextPublicId() } });
  } catch (error) {
    const isDuplicatePublicId =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | undefined)?.includes("publicId");

    if (!isDuplicatePublicId || attempt >= 5) throw error;
    return createOrderWithUniquePublicId(data, attempt + 1);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const scope = request.nextUrl.searchParams.get("scope") || "public";
    const where =
      scope === "mine" && user?.role === Role.CLIENT && user.clientProfile
        ? { clientProfileId: user.clientProfile.id }
        : scope === "admin" && user?.role === Role.ADMIN
          ? {}
          : { status: "PUBLISHED" as const };

    const orders = await prisma.order.findMany({
      where,
      include: {
        clientProfile: true,
        positions: { orderBy: { createdAt: "asc" } },
        _count: { select: { applications: true } },
        aiMatches: {
          orderBy: { rank: "asc" },
          include: { creatorProfile: { include: { user: true } } }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return ok({ orders });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser([Role.CLIENT, Role.ADMIN]);
    const body = createOrderSchema.parse(await request.json());
    const flags = await getFeatureFlags();

    const clientProfile = user.role === Role.CLIENT
      ? user.clientProfile
      : body.clientProfileId
        ? await prisma.clientProfile.findUnique({ where: { id: body.clientProfileId } })
        : null;

    if (!clientProfile) {
      throw new ApiError(400, user.role === Role.ADMIN ? "Выберите заказчика" : "Заполните карточку компании");
    }
    if (user.role === Role.CLIENT && !clientProfile.isApproved) {
      throw new ApiError(403, "Дождитесь одобрения анкеты администратором");
    }

    // Позиции проекта задаёт заказчик — нужна хотя бы одна с непустым
    // названием. У вакансии позиция всегда одна и совпадает с title заказа,
    // так что здесь просто игнорируем positions, если они были присланы.
    const positionTitles =
      body.kind === "PROJECT"
        ? Array.from(new Set(body.positions?.map((title) => title.trim()).filter(Boolean) ?? []))
        : [body.title];
    if (body.kind === "PROJECT" && positionTitles.length === 0) {
      throw new ApiError(400, "Добавьте хотя бы одну позицию для проекта");
    }
    // Волонтёрская позиция доступна только для проектов — у вакансии нет
    // смысла в отдельном "бесплатном" отклике, там и так один отклик = один
    // специалист.
    const acceptsVolunteers = body.kind === "PROJECT" && body.acceptsVolunteers;

    // Админ публикует сразу; для остальных — оплата приоритетнее модерации
    // (сначала PAYMENT_PENDING, оплата переводит в MODERATION или сразу в
    // PUBLISHED, см. lib/payments.ts::createTestPayment).
    const status = user.role === Role.ADMIN
      ? "PUBLISHED"
      : flags.paymentsRequired
        ? "PAYMENT_PENDING"
        : flags.moderationRequired
          ? "MODERATION"
          : "PUBLISHED";

    const order = await createOrderWithUniquePublicId({
      title: body.title,
      category: body.category,
      description: body.description,
      requirements: body.requirements,
      budget: body.budget,
      deadline: body.deadline,
      initiator: body.initiator,
      clientProfileId: clientProfile.id,
      status,
      kind: body.kind,
      acceptsVolunteers,
      paymentRequired: flags.paymentsRequired,
      moderationRequired: user.role === Role.CLIENT && flags.moderationRequired,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      positions: {
        create: [
          ...positionTitles.map((title) => ({ title })),
          ...(acceptsVolunteers ? [{ title: "Волонтёр", isVolunteer: true }] : [])
        ]
      }
    });

    return ok({ order }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
