import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/brand/Footer";
import { Header } from "@/components/brand/Header";

// APP_URL — тот же env var, что уже используется в lib/telegram-bot.ts для
// ссылки "Открыть кабинет" в Telegram-меню; здесь он же задаёт базовый URL
// для OG/Twitter-превью и метаданных (см. пункт "нет OG-тегов" в
// creatin_world_audit_1.md).
const APP_URL = process.env.APP_URL || "https://creatin.world";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "CREATIN.WORLD",
  description: "Платформа для креаторов и заказчиков.",
  openGraph: {
    title: "CREATIN.WORLD",
    description: "Платформа для креаторов и заказчиков.",
    url: APP_URL,
    siteName: "CREATIN.WORLD",
    locale: "ru_RU",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "CREATIN.WORLD",
    description: "Платформа для креаторов и заказчиков."
  }
};

// Тема (light/dark) читается синхронно инлайновым скриптом в <head>, ДО
// гидратации React — иначе между первым рендером (по умолчанию dark, см.
// data-theme ниже) и применением сохранённой темы был бы заметный "мигающий"
// пересвет страницы. suppressHydrationWarning нужен, т.к. этот скрипт может
// поменять data-theme на клиенте раньше, чем React сверит разметку.
const themeScript = `
  try {
    var savedTheme = localStorage.getItem("creatin-world-theme");
    var theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "dark";
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
