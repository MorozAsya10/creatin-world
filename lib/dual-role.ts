// Общий хелпер для роутов, которые отдают данные "по роли" (чаты, отклики,
// приглашения, заказы) — теперь, когда один аккаунт может держать и анкету
// креатора, и карточку заказчика одновременно (см. hasRole в lib/session.ts
// и POST /api/profiles/{creator,client}), такие роуты не могут полагаться
// только на User.role: он отражает лишь то, с какой ролью человек изначально
// зарегистрировался, а не то, какой кабинет открыт у него на экране сейчас.
// Фронт (activeView в components/platform/PlatformShell.tsx) передаёт
// ?as=CREATOR|CLIENT, чтобы явно сказать, какой набор данных ему нужен;
// resolveViewRole проверяет, что запрошенная роль вообще есть у аккаунта
// (иначе тихо откатывается на user.role), и больше нигде эту проверку
// дублировать не нужно.
import { Role } from "@prisma/client";

type RoleAwareUser = {
  role: Role;
  creatorProfile: unknown;
  clientProfile: unknown;
};

export function resolveViewRole(user: RoleAwareUser, requestedAs: string | null): Role {
  if (requestedAs === Role.CREATOR && user.creatorProfile) return Role.CREATOR;
  if (requestedAs === Role.CLIENT && user.clientProfile) return Role.CLIENT;
  return user.role;
}
