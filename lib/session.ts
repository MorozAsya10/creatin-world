import { cookies } from "next/headers";
import { Role, type User } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

// Своя лёгкая сессия вместо next-auth: подписанная HMAC-cookie, без записи
// сессии в БД. encodeSession/decodeSession ниже — по сути самодельный JWT
// (payload в base64url + подпись), но без внешней зависимости.
const SESSION_COOKIE = "creatin_session";

type SessionPayload = {
  userId: string;
  role: Role;
  issuedAt: number;
};

// См. пункт 2 в creatin_world_audit_1.md: раньше при отсутствующем/коротком
// AUTH_SECRET приложение молча подписывало все сессии захардкоженной
// строкой, которая лежит в открытом виде в публичном репозитории на GitHub —
// это позволило бы подделать валидную cookie для любого userId. В
// production теперь падаем громко (500 на любой запрос с сессией) вместо
// тихой дыры; в dev/тестах оставляем прежний fallback для удобства.
function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET не задан или короче 16 символов в production. Задайте длинную случайную строку в переменных окружения Render."
    );
  }

  return "development-only-creatin-world-secret";
}

function secureSessionCookie() {
  return process.env.AUTH_COOKIE_SECURE === "true";
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload) {
  const body = base64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function decodeSession(value?: string): SessionPayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  // timingSafeEqual вместо === — чтобы сравнение подписи не давало
  // атакующему возможность подбирать hash по времени ответа.
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: Pick<User, "id" | "role">) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession({ userId: user.id, role: user.role, issuedAt: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureSessionCookie(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secureSessionCookie(),
    path: "/",
    maxAge: 0
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      creatorProfile: {
        include: {
          files: {
            orderBy: { createdAt: "desc" }
          }
        }
      },
      clientProfile: true
    }
  });
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

// Один Telegram-аккаунт может держать и анкету креатора, и карточку
// заказчика одновременно (см. app/api/profiles/{creator,client}/route.ts —
// POST активирует вторую роль на существующем пользователе). Поэтому доступ
// к CREATOR/CLIENT-действиям проверяем не по единственному User.role
// (это скорее "как человек изначально зарегистрировался"), а по факту
// наличия нужного профиля — так дуал-профильный пользователь проходит оба
// гейта. ADMIN — исключение, отдельного "профиля админа" нет, для него
// role остаётся источником истины.
function hasRole(user: SessionUser, role: Role) {
  if (role === Role.ADMIN) return user.role === Role.ADMIN;
  if (role === Role.CREATOR) return Boolean(user.creatorProfile);
  if (role === Role.CLIENT) return Boolean(user.clientProfile);
  return false;
}

// Используется в начале почти каждого app/api/**/route.ts: без roles —
// просто требует авторизации, с roles — ещё и проверяет доступ (см. hasRole).
// Бросает ApiError, которую ловит lib/api.ts::fail() и превращает в 401/403.
export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required");
  if (roles && !roles.some((role) => hasRole(user, role))) throw new ApiError(403, "Forbidden");
  return user;
}
