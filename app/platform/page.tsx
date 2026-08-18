import { Suspense } from "react";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { ADMIN_PANEL_ROUTE } from "@/lib/admin-route";
import { getCurrentUser } from "@/lib/session";

// /platform — общий кабинет для CREATOR и CLIENT (см. PlatformShell).
// "Чистого" админа (нет ни анкеты креатора, ни карточки заказчика) сюда
// пускать незачем — редирект в админку. Но один Telegram-аккаунт может быть
// одновременно и админом, и креатором/заказчиком (см. dual-role в
// lib/session.ts) — такой пользователь должен попадать в свой обычный
// кабинет, а не улетать в /admin при каждом заходе просто потому что
// user.role === ADMIN.
export default async function PlatformPage() {
  const user = await getCurrentUser();
  const isPureAdmin = user?.role === Role.ADMIN && !user.creatorProfile && !user.clientProfile;
  if (isPureAdmin) redirect(ADMIN_PANEL_ROUTE);

  return (
    <Suspense fallback={<section className="section fill"><div className="loading">Загружаем кабинет...</div></section>}>
      <PlatformShell />
    </Suspense>
  );
}
