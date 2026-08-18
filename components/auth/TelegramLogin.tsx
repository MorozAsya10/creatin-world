"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SelectControl } from "@/components/ui/SelectControl";
import { SPECIALIZATION_SUGGESTIONS } from "@/lib/presentation";

type LoginRole = "creator" | "client";
type AuthMode = "login" | "register";
type Step = "choose" | "register-form" | "widget";
// Для тайла "Я заказчик" — обычная компания или уже существующий на
// платформе креатор, который хочет тем же Telegram-аккаунтом завести ещё и
// карточку заказчика (см. RoleActivationPanel в PlatformShell.tsx — прямое
// направление "креатор -> заказчик" убрано из кабинета и перенесено сюда).
type ClientKind = "organization" | "creator";

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
    onCreatinTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

const roleCopy: Record<LoginRole, { title: string; text: string; name: string; id: string; username: string }> = {
  creator: {
    title: "Я креатор",
    text: "Ищу проекты, хочу вступить в сообщество.",
    name: "Анна",
    id: "10001",
    username: "annakim"
  },
  client: {
    title: "Я заказчик",
    text: "Хочу размещать заказы и находить исполнителей.",
    name: "Никита",
    id: "20001",
    username: "northfounder"
  }
};

async function responseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function CreatorRegistrationFields() {
  return (
    <>
      <div className="form-grid">
        <div className="form-row"><label>Имя</label><input name="firstName" required minLength={1} placeholder="Имя" /></div>
        <div className="form-row"><label>Фамилия</label><input name="lastName" required minLength={1} placeholder="Фамилия" /></div>
      </div>
      <div className="form-grid">
        <div className="form-row">
          <label>Категория</label>
          <SelectControl name="category" defaultValue="Дизайн">
            <option>Дизайн</option>
            <option>Видео</option>
            <option>Тексты</option>
            <option>Маркетинг</option>
            <option>Креатив</option>
            <option>AI</option>
            <option>Менеджмент</option>
          </SelectControl>
        </div>
        <div className="form-row">
          <label>Основная специализация</label>
          <input name="primaryRole" required minLength={2} list="specialization-suggestions" placeholder="Выберите из списка или впишите свою" />
          <datalist id="specialization-suggestions">
            {SPECIALIZATION_SUGGESTIONS.map((item) => <option value={item} key={item} />)}
          </datalist>
          <small className="field-hint">Одна сильная сторона, а не всё подряд — остальные навыки добавите в профиле позже.</small>
        </div>
      </div>
      <div className="form-grid">
        <div className="form-row"><label>Опыт, лет</label><input name="experienceYears" type="number" min={0} required defaultValue={1} /></div>
        <div className="form-row"><label>Портфолио (ссылка)</label><input name="portfolioUrl" type="url" placeholder="https://" /></div>
      </div>
    </>
  );
}

function ClientRegistrationFields() {
  return (
    <>
      <div className="form-row"><label>Компания</label><input name="companyName" required minLength={2} placeholder="Название компании" /></div>
      <div className="form-grid">
        <div className="form-row"><label>Сфера деятельности</label><input name="industry" required minLength={2} placeholder="Например, Fashion / E-commerce" /></div>
        <div className="form-row"><label>Контактное лицо</label><input name="contactName" required minLength={2} placeholder="Имя и фамилия" /></div>
      </div>
    </>
  );
}

// Общий вход для CREATOR/CLIENT (админ входит отдельно, см.
// AdminTelegramLogin.tsx). Три шага: выбор роли+режима -> (если регистрация)
// короткая форма мини-анкеты -> подтверждение личности Telegram-виджетом.
// Сам виджет — сторонний script, который вызывает глобальный колбэк
// (window.onCreatinTelegramAuth) с подписанными Telegram данными; итоговая
// проверка подписи — на сервере, см. lib/telegram.ts::verifyTelegramPayload.
// Если demoEnabled (TELEGRAM_AUTH_BYPASS) — виджет вообще не грузится,
// вместо него сразу шлём фиктивный payload с hash: "dev-bypass".
export function TelegramLogin({ demoEnabled }: { demoEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const widgetRef = useRef<HTMLDivElement>(null);
  const pendingModeRef = useRef<AuthMode>("login");
  const registrationDraftRef = useRef<Record<string, unknown> | undefined>(undefined);
  const initialRole = (params.get("role") as LoginRole) || "creator";
  const [role, setRole] = useState<LoginRole>(["creator", "client"].includes(initialRole) ? initialRole : "creator");
  const [clientKind, setClientKind] = useState<ClientKind>("organization");
  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const roles = useMemo(() => Object.entries(roleCopy) as Array<[LoginRole, (typeof roleCopy)[LoginRole]]>, []);

  async function submitTelegram(
    payload: TelegramWidgetUser,
    requestedRole: LoginRole,
    mode: AuthMode,
    registration?: Record<string, unknown>
  ) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, requestedRole, mode, registration })
      });

      if (!response.ok) {
        setError(await responseError(response, "Не удалось выполнить вход через Telegram"));
        return;
      }

      router.replace("/platform");
      router.refresh();
    } catch {
      setError("Сервер входа недоступен. Проверьте PostgreSQL и повторите попытку.");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin(demoRole: LoginRole, mode: AuthMode, registration?: Record<string, unknown>) {
    const selected = roleCopy[demoRole];
    // Для демо-регистрации нужен свежий telegramId, иначе попадём на уже существующий сид-аккаунт.
    const id = mode === "register" ? `${selected.id}-demo-${Date.now()}` : selected.id;

    await submitTelegram(
      {
        id,
        first_name: selected.name,
        last_name: demoRole === "creator" ? "Ким" : "Романов",
        username: selected.username,
        auth_date: String(Math.floor(Date.now() / 1000)),
        hash: "dev-bypass"
      },
      demoRole,
      mode,
      registration
    );
  }

  function chooseLogin() {
    setError("");
    pendingModeRef.current = "login";
    if (demoEnabled) {
      void demoLogin(role, "login");
      return;
    }
    setStep("widget");
  }

  function chooseRegister() {
    setError("");
    setStep("register-form");
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const registration =
      role === "creator"
        ? {
            firstName: String(form.get("firstName") || ""),
            lastName: String(form.get("lastName") || ""),
            category: String(form.get("category") || ""),
            primaryRole: String(form.get("primaryRole") || ""),
            experienceYears: Number(form.get("experienceYears") || 0),
            portfolioUrl: String(form.get("portfolioUrl") || "")
          }
        : {
            companyName: String(form.get("companyName") || ""),
            industry: String(form.get("industry") || ""),
            contactName: String(form.get("contactName") || "")
          };

    pendingModeRef.current = "register";
    registrationDraftRef.current = registration;

    if (demoEnabled) {
      await demoLogin(role, "register", registration);
      return;
    }

    setStep("widget");
  }

  useEffect(() => {
    const requestedRole = params.get("role") as LoginRole | null;
    if (requestedRole && ["creator", "client"].includes(requestedRole)) {
      setRole(requestedRole);
      setError("");
    }
  }, [params]);

  useEffect(() => {
    if (!botUsername || !widgetRef.current) return;

    window.onCreatinTelegramAuth = (user) => {
      void submitTelegram(
        user,
        role,
        pendingModeRef.current,
        pendingModeRef.current === "register" ? registrationDraftRef.current : undefined
      );
    };

    widgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onCreatinTelegramAuth(user)");
    widgetRef.current.appendChild(script);
  }, [botUsername, role, step]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="eyebrow">Единая регистрация</div>
        <h2>Войти через Telegram</h2>
        <p>
          Telegram подтверждает личность пользователя. Уже зарегистрированные заходят сразу,
          новым креаторам и заказчикам нужно заполнить короткую анкету — доступ к кабинету
          откроется после решения администратора.
        </p>
        <div className="auth-role-grid">
          {roles.map(([key, item]) => (
            <button
              key={key}
              className={`auth-role ${role === key ? "selected" : ""}`}
              disabled={loading}
              onClick={() => {
                setRole(key);
                setError("");
                setStep("choose");
                setClientKind("organization");
                router.replace(`/login?role=${key}`, { scroll: false });
              }}
            >
              <b>{item.title}</b>
              <span>{item.text}</span>
            </button>
          ))}
        </div>

        {role === "client" ? (
          <div className="form-row" style={{ marginTop: 12 }}>
            <label>Кто размещает заказ</label>
            <SelectControl
              value={clientKind}
              onChange={(event) => {
                setClientKind(event.target.value as ClientKind);
                setError("");
                setStep("choose");
              }}
            >
              <option value="organization">Организация</option>
              <option value="creator">Я уже креатор на платформе</option>
            </SelectControl>
            {clientKind === "creator" ? (
              <small className="field-hint">
                Войдёте тем же Telegram-аккаунтом, что и в анкете креатора — карточка заказчика
                добавится к нему же, кабинеты можно будет переключать без повторного входа.
              </small>
            ) : null}
          </div>
        ) : null}

        {error ? <div className="notice error-notice" role="alert">{error}</div> : null}

        {step === "choose" ? (
          <div className="hero-actions">
            {role === "client" && clientKind === "creator" ? null : (
              <button className="btn wine" type="button" onClick={chooseLogin} disabled={loading}>
                Являюсь пользователем
              </button>
            )}
            <button className="btn" type="button" onClick={chooseRegister} disabled={loading}>
              {role === "client" && clientKind === "creator" ? "Тоже разместить заказ" : "Зарегистрироваться"}
            </button>
          </div>
        ) : null}

        {step === "register-form" ? (
          <form className="panel" onSubmit={submitRegistration} style={{ marginTop: 16 }}>
            <div className="panel-head">
              <span className="panel-title">
                {role === "creator"
                  ? "Анкета креатора"
                  : clientKind === "creator"
                    ? "Заодно разместите заказ"
                    : "Анкета заказчика"}
              </span>
              <button className="btn ghost" type="button" onClick={() => setStep("choose")} disabled={loading}>
                Назад
              </button>
            </div>
            <div className="panel-body">
              {role === "creator" ? <CreatorRegistrationFields /> : <ClientRegistrationFields />}
              <button className="btn wine" disabled={loading} style={{ marginTop: 12 }}>
                {loading ? "Отправляем..." : demoEnabled ? "Отправить заявку (демо)" : "Далее: подтвердить в Telegram"}
              </button>
            </div>
          </form>
        ) : null}

        {step === "widget" && !demoEnabled ? (
          <>
            <p className="page-copy" style={{ marginTop: 16 }}>
              {pendingModeRef.current === "register"
                ? "Подтвердите личность в Telegram, чтобы отправить заявку на регистрацию."
                : "Подтвердите личность в Telegram, чтобы войти."}
            </p>
            <div className="telegram-widget-slot" ref={widgetRef} aria-label="Telegram Login widget" />
            <button className="btn ghost" type="button" onClick={() => setStep("choose")} disabled={loading} style={{ marginTop: 8 }}>
              Назад
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
