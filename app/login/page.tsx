import { Suspense } from "react";
import { TelegramLogin } from "@/components/auth/TelegramLogin";

// Suspense обязателен: TelegramLogin читает ?role=/?mode= через
// useSearchParams(), а Next.js требует, чтобы клиентские компоненты с этим
// хуком были обёрнуты в Suspense на серверном рендере страницы.
export default function LoginPage() {
  const demoEnabled = process.env.TELEGRAM_AUTH_BYPASS === "true";

  return (
    <Suspense fallback={<div className="auth-screen"><div className="loading">Загрузка входа...</div></div>}>
      <TelegramLogin demoEnabled={demoEnabled} />
    </Suspense>
  );
}
