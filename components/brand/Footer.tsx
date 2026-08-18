"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Глобальный футер (см. app/layout.tsx) — простая карта сайта плюс два CTA,
// которые уже есть в шапке для гостя. Год берём динамически, чтобы не
// протухал в копирайте. Скрыт на "приложенческих" экранах (кабинет, админка,
// логин) — у них свой полноэкранный layout (см. .platform/.admin-layout в
// globals.css), футер там только добавил бы лишний скролл.
const HIDDEN_PREFIXES = ["/platform", "/admin", "/login"];

export function Footer() {
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (HIDDEN_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return null;

  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Link className="logo" href="/">
            CREATIN<span>.</span>WORLD
          </Link>
          <p>Профессиональная платформа креативного рынка.</p>
        </div>
        <div className="footer-col">
          <div className="eyebrow">Платформа</div>
          <ul>
            <li>
              <Link href="/creators">Креаторы</Link>
            </li>
            <li>
              <Link href="/jobs">Вакансии</Link>
            </li>
            <li>
              <Link href="/partners">Партнёры</Link>
            </li>
          </ul>
        </div>
        <div className="footer-col">
          <div className="eyebrow">Начать</div>
          <ul>
            <li>
              <Link href="/login?role=creator">Стать креатором</Link>
            </li>
            <li>
              <Link href="/login?role=client">Разместить заказ</Link>
            </li>
          </ul>
        </div>
        <div className="footer-copyright">© {year} CREATIN.WORLD</div>
      </div>
      <div className="footer-bottom">Сделано для сильных идей</div>
    </footer>
  );
}
