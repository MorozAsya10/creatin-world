// Простой in-memory rate limit (фиксированное окно) — см. аудит
// (creatin_world_audit_1.md): "нет rate limiting ни на одном роуте", что
// снижает стоимость перебора/спама на auth- и payment-эндпоинтах. Этого
// достаточно для одного инстанса на MVP-масштабе. Ограничения:
// не переживёт рестарт процесса и не работает между несколькими
// инстансами — если Render когда-нибудь начнёт горизонтально скейлить
// сервис, счётчики стоит перенести в Redis/БД.
import { ApiError } from "@/lib/api";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Оппортунистическая чистка протухших записей, чтобы Map не росла
// бесконечно на долгоживущем процессе — полноценный cron тут избыточен.
function sweepExpired(now: number) {
  if (Math.random() > 0.01) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function check(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweepExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

// Render проксирует запросы — request.ip в Next.js тут обычно undefined,
// реальный клиентский IP приходит в x-forwarded-for.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Бросает ApiError(429) при превышении лимита — подхватывается тем же
// catch (error) { return fail(error); }, что и остальные ошибки роутов.
// identifier по умолчанию — IP клиента; для авторизованных запросов лучше
// передавать userId явно, чтобы не делить лимит на всех за одним NAT/прокси.
export function enforceRateLimit(
  request: Request,
  opts: { name: string; limit: number; windowMs: number; identifier?: string }
) {
  const id = opts.identifier || clientIp(request);
  const result = check(`${opts.name}:${id}`, opts.limit, opts.windowMs);
  if (!result.ok) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    throw new ApiError(429, `Слишком много запросов. Попробуйте снова через ${retryAfterSec} сек.`);
  }
}
