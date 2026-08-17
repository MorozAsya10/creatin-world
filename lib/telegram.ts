import { Role } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ApiError } from "@/lib/api";

export type TelegramLoginPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: string;
  hash?: string;
  requestedRole?: "creator" | "client" | "admin";
  mode?: "login" | "register";
  registration?: Record<string, unknown>;
};

// Единственные поля, которые реально подписывает виджет Telegram.
// Любые другие свойства payload (requestedRole, mode, registration и т.д.)
// добавляет наше приложение и они не должны участвовать в проверке подписи.
const TELEGRAM_SIGNED_FIELDS = ["auth_date", "first_name", "id", "last_name", "photo_url", "username"] as const;

function roleFromRequest(requestedRole?: TelegramLoginPayload["requestedRole"]) {
  if (requestedRole === "admin") return Role.ADMIN;
  if (requestedRole === "client") return Role.CLIENT;
  return Role.CREATOR;
}

export function verifyTelegramPayload(payload: TelegramLoginPayload) {
  const bypass = process.env.TELEGRAM_AUTH_BYPASS === "true";
  if (bypass) return;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new ApiError(500, "Telegram bot token is not configured");
  if (!payload.hash || !payload.auth_date) throw new ApiError(400, "Telegram hash is missing");

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) throw new ApiError(400, "Invalid Telegram auth date");
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > 60 * 60 * 24) throw new ApiError(401, "Telegram login payload expired");

  const signedFields = Object.entries(payload)
    .filter(([key, value]) => (TELEGRAM_SIGNED_FIELDS as readonly string[]).includes(key) && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(signedFields).digest("hex");
  const left = Buffer.from(payload.hash, "hex");
  const right = Buffer.from(expected, "hex");

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError(401, "Telegram signature is invalid");
  }
}

export function normalizeTelegramUser(payload: TelegramLoginPayload) {
  const first = payload.first_name?.trim() || "CREATIN";
  const last = payload.last_name?.trim() || "User";

  return {
    telegramId: String(payload.id),
    telegramUsername: payload.username,
    name: `${first} ${last}`.trim(),
    role: roleFromRequest(payload.requestedRole)
  };
}
