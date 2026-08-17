import { ok } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  await clearSessionCookie();
  return ok({ ok: true });
}
