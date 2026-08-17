// Три флага управляют, какие шаги обязательны в воронках креатора/заказчика:
//   paymentsRequired    — нужна ли оплата, чтобы анкета/заказ ушли дальше DRAFT
//                          (иначе публикация происходит сразу, см. lib/payments.ts).
//   moderationRequired  — нужно ли ручное одобрение админом после оплаты/анкеты.
//   aiExternalRequired  — если true, при недоступности внешнего AI подбор
//                          падает с ошибкой; если false — тихо использует
//                          локальный fallback-алгоритм (см. lib/ai.ts).
// Хранятся в таблице FeatureFlag и правятся из админки; ENV-переменные —
// только значения по умолчанию на случай пустой/недоступной БД (см. catch ниже).
import { prisma } from "@/lib/prisma";

export type FeatureFlags = {
  paymentsRequired: boolean;
  moderationRequired: boolean;
  aiExternalRequired: boolean;
};

const envFlag = (key: string) => process.env[key] === "true";

export const defaultFeatureFlags: FeatureFlags = {
  paymentsRequired: envFlag("FEATURE_PAYMENTS_REQUIRED"),
  moderationRequired: envFlag("FEATURE_MODERATION_REQUIRED"),
  aiExternalRequired: envFlag("FEATURE_AI_EXTERNAL_REQUIRED")
};

const dbFlagKey: Record<keyof FeatureFlags, string> = {
  paymentsRequired: "payments.required",
  moderationRequired: "moderation.required",
  aiExternalRequired: "ai.external_required"
};

// Читает флаги из БД (источник истины), подставляя ENV-дефолт для
// отсутствующих ключей. Если БД недоступна — откатываемся на ENV целиком,
// чтобы один сбой конфигурации не положил вообще все API-роуты.
export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const rows = await prisma.featureFlag.findMany();
    const byKey = new Map(rows.map((flag) => [flag.key, flag.enabled]));

    return {
      paymentsRequired: byKey.get(dbFlagKey.paymentsRequired) ?? defaultFeatureFlags.paymentsRequired,
      moderationRequired:
        byKey.get(dbFlagKey.moderationRequired) ?? defaultFeatureFlags.moderationRequired,
      aiExternalRequired:
        byKey.get(dbFlagKey.aiExternalRequired) ?? defaultFeatureFlags.aiExternalRequired
    };
  } catch {
    return defaultFeatureFlags;
  }
}
