import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/AdminPanel";

// Этот путь (/admin) сам по себе недоступен — proxy.ts возвращает по нему
// 404, наружу админка открывается только по секретному URL из
// lib/admin-route.ts. noindex/nocache — дополнительная страховка от
// индексации, если проверка в proxy.ts когда-нибудь будет обойдена.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true }
};

export default function AdminPage() {
  const demoEnabled = process.env.TELEGRAM_AUTH_BYPASS === "true";

  return <AdminPanel demoEnabled={demoEnabled} />;
}
