"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeControl } from "@/components/ui/ThemeControl";
import { ADMIN_PANEL_ROUTE } from "@/lib/admin-route";
import type { ApiUser } from "@/lib/types";

function roleLabel(role?: string) {
  if (role === "CREATOR") return "Креатор";
  if (role === "CLIENT") return "Заказчик";
  if (role === "ADMIN") return "Администратор";
  return "";
}

// Глобальный хедер на всех страницах (см. app/layout.tsx). Правый блок
// намеренно минимальный: одна кнопка "Кабинет" — вся остальная навигация
// (отклики, новый заказ, подписка и т.д.) живёт внутри самого кабинета
// (components/platform/PlatformShell.tsx), чтобы не дублировать её здесь.
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<ApiUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data: { user: ApiUser | null }) => setUser(data.user))
      .catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="header">
      <Link className="logo" href="/">
        CREATIN<span>.</span>WORLD
      </Link>
      <nav className="main-nav">
        <Link className={`navbtn ${pathname === "/" ? "active" : ""}`} href="/">
          О платформе
        </Link>
        <Link className={`navbtn ${pathname === "/creators" ? "active" : ""}`} href="/creators">
          Креаторы
        </Link>
        <Link className={`navbtn ${pathname === "/jobs" ? "active" : ""}`} href="/jobs">
          Вакансии
        </Link>
        <Link className={`navbtn ${pathname === "/partners" ? "active" : ""}`} href="/partners">
          Партнёры
        </Link>
      </nav>
      <div className="header-actions">
        <ThemeControl compact />
        {!user ? (
          <>
            <Link className="btn public-secondary" href="/login?role=creator">
              Стать креатором
            </Link>
            <Link className="btn wine" href="/login?role=client">
              Разместить заказ
            </Link>
          </>
        ) : (
          <>
            {/* Скрываем "Кабинет" только у "чистого" админа — без анкеты
                креатора/заказчика туда всё равно нечего показывать (см. тот
                же isPureAdmin в app/platform/page.tsx). Админ с профилем
                (см. lib/session.ts про dual-role) продолжает видеть кнопку. */}
            {user.role === "ADMIN" && !user.creatorProfile && !user.clientProfile ? null : (
              <Link className="btn header-cabinet" href="/platform" aria-label="Кабинет">
                <LayoutDashboard size={16} /><span>Кабинет</span>
              </Link>
            )}
            {user.role === "ADMIN" ? (
              <Link className="btn header-cabinet" href={ADMIN_PANEL_ROUTE} aria-label="Админка">
                Админка
              </Link>
            ) : null}
            <span className="role-pill">{roleLabel(user.role)}</span>
            <Avatar name={user.name} photoUrl={user.creatorProfile?.photoUrl} />
            <button className="btn ghost icon" onClick={logout} title="Выйти" aria-label="Выйти">
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
