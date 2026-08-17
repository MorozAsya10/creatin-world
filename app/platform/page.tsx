import { Suspense } from "react";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ADMIN_PANEL_ROUTE } from "@/lib/admin-route";
import { getCurrentUser } from "@/lib/session";

// /platform — общий кабинет для CREATOR и CLIENT (см. PlatformShell). Админ
// сюда никогда не попадает: редирект срабатывает на каждый заход (включая
// клиентскую навигацию, т.к. это серверный компонент), поэтому в
// PlatformShell нет и не должно быть отдельной ADMIN-ветки рендера.
export default async function PlatformPage() {
  const user = await getCurrentUser();
  if (user?.role === Role.ADMIN) redirect(ADMIN_PANEL_ROUTE);

  return (
    <Suspense fallback={<section className="section fill"><div className="loading">Загружаем кабинет...</div></section>}>
      <PlatformShell />
    </Suspense>
  );
}
