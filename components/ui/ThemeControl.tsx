"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const storageKey = "creatin-world-theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// Тема хранится на <html data-theme> (читается синхронно инлайновым
// скриптом в app/layout.tsx, чтобы не мигать при загрузке — см. комментарий
// там) и в localStorage. CustomEvent нужен потому, что на странице обычно
// смонтирован не один <ThemeControl> (compact-версия в хедере и полная в
// настройках кабинета) — событие держит их синхронными без общего стора.
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new CustomEvent("creatin-theme-change", { detail: theme }));
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());

    const syncTheme = (event: Event) => {
      const nextTheme = (event as CustomEvent<Theme>).detail;
      setTheme(nextTheme);
    };

    window.addEventListener("creatin-theme-change", syncTheme);
    return () => window.removeEventListener("creatin-theme-change", syncTheme);
  }, []);

  function choose(nextTheme: Theme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  if (compact) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const label = nextTheme === "light" ? "Включить светлую тему" : "Включить тёмную тему";

    return (
      <button className="btn ghost icon theme-toggle" type="button" onClick={() => choose(nextTheme)} title={label} aria-label={label}>
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    );
  }

  return (
    <div className="theme-control" role="group" aria-label="Тема интерфейса">
      <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => choose("dark")}>
        <Moon size={16} /> Тёмная
      </button>
      <button className={theme === "light" ? "active" : ""} type="button" onClick={() => choose("light")}>
        <Sun size={16} /> Светлая
      </button>
    </div>
  );
}
