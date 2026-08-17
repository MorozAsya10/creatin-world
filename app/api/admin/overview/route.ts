import { Role } from "@prisma/client";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// AiLog.error иногда содержит текст ошибки от OpenAI SDK, который может
// включать сам API-ключ (например, в сообщении об неверной авторизации) —
// вырезаем похожие на sk-... токены перед тем как отдать лог в админку.
function sanitizeAiError(message: string | null) {
  if (!message) return null;

  return message
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED]")
    .slice(0, 600);
}

const featureFlagDescriptions: Record<string, string> = {
  "payments.required": "Доступ открывается только после подтверждения оплаты.",
  "moderation.required": "Анкеты и заказы требуют ручного решения администратора.",
  "ai.external_required": "При недоступности внешнего AI резервный подбор не используется."
};

// Единый "дашборд" для админки: счётчики + все четыре очереди модерации
// (креаторы на регистрации, креаторы на полной анкете, заказы, заказчики) +
// последние события. Один большой Promise.all вместо отдельных эндпоинтов —
// проще для одного экрана, но при росте данных стоит пересмотреть на пагинацию.
export async function GET() {
  try {
    await requireUser([Role.ADMIN]);

    const [
      users,
      creators,
      clients,
      orders,
      applications,
      payments,
      aiLogs,
      featureFlags,
      pendingCreators,
      pendingCreatorProfiles,
      pendingOrders,
      pendingClients,
      clientProfiles,
      latestUsers,
      latestOrders,
      latestPayments,
      latestAiLogs
    ] = await Promise.all([
      prisma.user.count(),
      prisma.creatorProfile.count(),
      prisma.clientProfile.count(),
      prisma.order.count(),
      prisma.application.count(),
      prisma.payment.count(),
      prisma.aiLog.count(),
      prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      prisma.creatorProfile.findMany({
        where: { status: "MODERATION", moderationStage: "REGISTRATION" },
        include: { user: true },
        orderBy: { updatedAt: "asc" }
      }),
      prisma.creatorProfile.findMany({
        where: { status: "MODERATION", moderationStage: "PROFILE" },
        include: { user: true },
        orderBy: { updatedAt: "asc" }
      }),
      prisma.order.findMany({
        where: { status: "MODERATION" },
        include: { clientProfile: true },
        orderBy: { updatedAt: "asc" }
      }),
      prisma.clientProfile.findMany({
        where: { status: "MODERATION" },
        include: { user: true },
        orderBy: { updatedAt: "asc" }
      }),
      prisma.clientProfile.findMany({
        select: {
          id: true,
          companyName: true,
          contactName: true
        },
        orderBy: { companyName: "asc" }
      }),
      prisma.user.findMany({ take: 8, orderBy: { createdAt: "desc" } }),
      prisma.order.findMany({
        take: 8,
        include: {
          clientProfile: true,
          _count: { select: { applications: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.payment.findMany({
        take: 8,
        include: { user: true, package: true },
        orderBy: { createdAt: "desc" }
      }),
      prisma.aiLog.findMany({
        take: 10,
        include: {
          order: {
            select: {
              publicId: true,
              title: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return ok({
      counters: { users, creators, clients, orders, applications, payments, aiLogs },
      featureFlags: featureFlags.map((flag) => ({
        ...flag,
        description: featureFlagDescriptions[flag.key] || flag.description
      })),
      pendingCreators,
      pendingCreatorProfiles,
      pendingOrders,
      pendingClients,
      clientProfiles,
      latestUsers,
      latestOrders,
      latestPayments,
      latestAiLogs: latestAiLogs.map((log) => ({
        ...log,
        error: sanitizeAiError(log.error)
      }))
    });
  } catch (error) {
    return fail(error);
  }
}
