import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// Health-check для Render (см. пункт "нет health-check" в
// creatin_world_audit_1.md) — Render дёргает этот роут по расписанию, чтобы
// понять, жив ли инстанс, и перезапустить его при проблеме. Помимо самого
// процесса Next.js, проверяем ещё и доступность БД: без неё сайт всё равно
// не работает, а простой "process alive" health-check это бы не поймал.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "ok", db: "ok" });
  } catch (error) {
    console.error("Health-check: БД недоступна", error);
    return ok({ status: "error", db: "unavailable" }, { status: 503 });
  }
}
