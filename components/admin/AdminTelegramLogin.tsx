"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TelegramWidgetUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: string;
  hash?: string;
};

declare global {
  interface Window {
    onCreatinAdminAuth?: (user: TelegramWidgetUser) => void;
  }
}

async function responseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

// Отдельный вход для скрытой админ-страницы: не выводится нигде на публичном
// сайте и не завязан на общий /login, чтобы саму возможность входа как
// администратор нельзя было обнаружить, не зная секретный путь.
export function AdminTelegramLogin({ demoEnabled, onSuccess }: { demoEnabled: boolean; onSuccess: () => void }) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  async function submit(payload: TelegramWidgetUser) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, requestedRole: "admin", mode: "login" })
      });

      if (!response.ok) {
        setError(await responseError(response, "Не удалось войти"));
        return;
      }

      onSuccess();
    } catch {
      setError("Сервер входа недоступен. Проверьте PostgreSQL и повторите попытку.");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin() {
    await submit({
      id: "90001",
      first_name: "CREATIN",
      last_name: "Admin",
      username: "creatin_admin",
      auth_date: String(Math.floor(Date.now() / 1000)),
      hash: "dev-bypass"
    });
  }

  useEffect(() => {
    if (demoEnabled || !botUsername || !widgetRef.current) return;

    window.onCreatinAdminAuth = (user) => {
      void submit(user);
    };

    widgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onCreatinAdminAuth(user)");
    widgetRef.current.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoEnabled, botUsername]);

  return (
    <div>
      {error ? <div className="notice error-notice" role="alert" style={{ marginBottom: 12 }}>{error}</div> : null}
      {demoEnabled ? (
        <button className="telegram" onClick={() => void demoLogin()} disabled={loading}>
          <Send size={16} /> {loading ? "Входим..." : "Открыть админ-панель"}
        </button>
      ) : (
        <div className="telegram-widget-slot" ref={widgetRef} aria-label="Telegram Login widget" />
      )}
    </div>
  );
}
