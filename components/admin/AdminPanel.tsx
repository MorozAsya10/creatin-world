"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AdminTelegramLogin } from "@/components/admin/AdminTelegramLogin";
import { SelectControl } from "@/components/ui/SelectControl";
import { orderInitiatorLabel, statusLabel } from "@/lib/presentation";
import type { Partner } from "@/lib/types";

type AdminOverview = {
  counters: {
    users: number;
    creators: number;
    clients: number;
    orders: number;
    applications: number;
    payments: number;
    aiLogs: number;
  };
  featureFlags: Array<{ key: string; enabled: boolean; description: string }>;
  pendingCreators: Array<{ id: string; firstName: string; lastName: string; primaryRole: string; user: { telegramUsername?: string | null } }>;
  pendingCreatorProfiles: Array<{ id: string; firstName: string; lastName: string; primaryRole: string; category: string; user: { telegramUsername?: string | null } }>;
  pendingOrders: Array<{ id: string; publicId: string; title: string; category: string; initiator: "CLIENT" | "CREATOR"; clientProfile: { companyName: string } }>;
  pendingClients: Array<{ id: string; companyName: string; industry: string; contactName: string; user: { telegramUsername?: string | null } }>;
  clientProfiles: Array<{ id: string; companyName: string; contactName: string }>;
  latestUsers: Array<{ id: string; name: string; role: string; telegramUsername?: string | null }>;
  latestOrders: Array<{ id: string; publicId: string; title: string; status: string; initiator: "CLIENT" | "CREATOR"; clientProfile: { companyName: string }; _count: { applications: number } }>;
  latestPayments: Array<{ id: string; status: string; amountCents?: number | null; user: { name: string }; package?: { title: string } | null }>;
  latestAiLogs: Array<{
    id: string;
    provider: string;
    status: string;
    error: string | null;
    createdAt: string;
    order: { publicId: string; title: string } | null;
  }>;
};

const roleLabels: Record<string, string> = {
  CREATOR: "Креатор",
  CLIENT: "Заказчик",
  ADMIN: "Администратор"
};

async function responseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

const flagMap = {
  "payments.required": "paymentsRequired",
  "moderation.required": "moderationRequired",
  "ai.external_required": "aiExternalRequired"
} as const;

const flagTitles: Record<string, string> = {
  "payments.required": "Подтверждение оплаты",
  "moderation.required": "Ручная модерация",
  "ai.external_required": "Только внешний AI"
};

function formatMoney(cents?: number | null) {
  if (!cents) return "Цена уточняется";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function aiLogStatus(log: AdminOverview["latestAiLogs"][number]) {
  if (log.status === "failed") return { label: "Ошибка API", className: "danger" };
  if (log.provider === "local-fallback") return { label: "Резервный расчёт", className: "warn" };
  return { label: "Успешно", className: "ok" };
}

function aiProviderName(provider: string) {
  if (provider === "local-fallback") return "Резервный подбор";
  if (provider.startsWith("openai:")) return "OpenAI";
  return "Внешний сервис";
}

// Рендерится на скрытом маршруте (см. app/admin/page.tsx + proxy.ts) —
// сама по себе не проверяет права, это делает GET /api/admin/overview: если
// он отвечает 401/403 (не залогинен как ADMIN), ниже показывается
// AdminTelegramLogin вместо панели (см. `if (error && !data)`). То есть
// "гейт" — это просто неудавшийся запрос, а не отдельная проверка сессии.
export function AdminPanel({ demoEnabled }: { demoEnabled: boolean }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [showPartnerForm, setShowPartnerForm] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/overview");
    if (!response.ok) {
      setError(await responseError(response, "Войдите как администратор через Telegram, чтобы открыть панель."));
      return;
    }
    setError("");
    setData((await response.json()) as AdminOverview);
  }

  async function loadPartners() {
    const response = await fetch("/api/admin/partners");
    if (!response.ok) return;
    const result = (await response.json()) as { partners: Partner[] };
    setPartners(result.partners || []);
  }

  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title")),
          sponsorName: String(form.get("sponsorName")),
          description: String(form.get("description")),
          imageUrl: String(form.get("imageUrl") || ""),
          linkUrl: String(form.get("linkUrl"))
        })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось опубликовать плашку"));
        return;
      }
      event.currentTarget.reset();
      setShowPartnerForm(false);
      await loadPartners();
    } finally {
      setBusy(false);
    }
  }

  async function togglePartner(partner: Partner) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/partners/${partner.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !partner.active })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось изменить плашку"));
        return;
      }
      await loadPartners();
    } finally {
      setBusy(false);
    }
  }

  async function deletePartner(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/partners/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось удалить плашку"));
        return;
      }
      await loadPartners();
    } finally {
      setBusy(false);
    }
  }

  async function toggleFlag(key: keyof typeof flagMap, enabled: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/feature-flags", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [flagMap[key]]: enabled })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось изменить настройку"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moderateCreator(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/creators/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось обработать анкету"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moderateClient(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось обработать анкету заказчика"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moderateOrder(id: string, status: "PUBLISHED" | "REJECTED") {
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось обработать заказ"));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientProfileId: String(form.get("clientProfileId")),
          initiator: String(form.get("initiator")),
          title: String(form.get("title")),
          category: String(form.get("category")),
          description: String(form.get("description")),
          requirements: String(form.get("requirements")),
          budget: String(form.get("budget")),
          deadline: String(form.get("deadline"))
        })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось создать заказ"));
        return;
      }

      const result = (await response.json()) as { order: { publicId: string } };
      setMessage(`${result.order.publicId} создан и опубликован.`);
      setShowOrderForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    void loadPartners();
  }, []);

  if (error && !data) {
    return (
      <section className="section fill">
        <div className="panel">
          <div className="panel-body">
            <div className="eyebrow">Админка</div>
            <h2 className="page-title">Доступ администратора</h2>
            <p className="page-copy">{error}</p>
            <div style={{ marginTop: 16 }}>
              <AdminTelegramLogin demoEnabled={demoEnabled} onSuccess={() => void load()} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return <section className="section fill"><div className="loading">Загружаем админ-панель...</div></section>;
  }

  return (
    <section className="section fill">
      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice">{message}</div> : null}
      <div className="page-head">
        <div>
          <div className="eyebrow">Управление платформой</div>
          <h2 className="page-title">Административная панель</h2>
          <p className="page-copy">Пользователи, заказы, платежи, модерация и качество рекомендаций.</p>
        </div>
        <div className="inline-actions">
          <button className="btn wine" type="button" onClick={() => setShowOrderForm((current) => !current)}>
            {showOrderForm ? <X size={16} /> : <Plus size={16} />} {showOrderForm ? "Закрыть" : "Новый заказ"}
          </button>
          <Link className="btn" href="/">На главную</Link>
        </div>
      </div>

      {showOrderForm ? (
        <form className="panel admin-order-form" onSubmit={createOrder}>
          <div className="panel-head">
            <span className="panel-title">Новый заказ</span>
            <span className="muted">Будет опубликован сразу</span>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="form-row">
                <label>Компания-владелец</label>
                <SelectControl name="clientProfileId" required defaultValue={data.clientProfiles[0]?.id || ""}>
                  {data.clientProfiles.map((client) => <option value={client.id} key={client.id}>{client.companyName} · {client.contactName}</option>)}
                </SelectControl>
              </div>
              <div className="form-row">
                <label>От кого заказ</label>
                <SelectControl name="initiator" defaultValue="CLIENT">
                  <option value="CLIENT">От заказчика</option>
                  <option value="CREATOR">От креатора</option>
                </SelectControl>
              </div>
              <div className="form-row">
                <label>Название</label>
                <input name="title" minLength={3} required placeholder="Название задачи" />
              </div>
              <div className="form-row">
                <label>Категория</label>
                <SelectControl name="category" defaultValue="Дизайн">
                  <option>Дизайн</option><option>Видео</option><option>Тексты</option><option>Маркетинг</option><option>Креатив</option><option>AI</option><option>Менеджмент</option>
                </SelectControl>
              </div>
              <div className="form-row">
                <label>Бюджет</label>
                <input name="budget" required placeholder="180–250 тыс. ₽" />
              </div>
              <div className="form-row">
                <label>Срок</label>
                <input name="deadline" required placeholder="3 недели" />
              </div>
              <div className="form-row full">
                <label>Описание и ожидаемый результат</label>
                <textarea name="description" minLength={10} required placeholder="Контекст, задача и результат" />
              </div>
              <div className="form-row full">
                <label>Требования</label>
                <textarea name="requirements" minLength={3} required placeholder="Опыт, навыки и обязательные материалы" />
              </div>
            </div>
            <button className="btn wine" disabled={busy || !data.clientProfiles.length}>{busy ? "Создаём..." : "Создать и опубликовать"}</button>
          </div>
        </form>
      ) : null}

      <div className="summary">
        <div className="metric"><span>Пользователи</span><b>{data.counters.users}</b></div>
        <div className="metric"><span>Креаторы</span><b>{data.counters.creators}</b></div>
        <div className="metric"><span>Заказы</span><b>{data.counters.orders}</b></div>
        <div className="metric"><span>Проверки подбора</span><b>{data.counters.aiLogs}</b></div>
      </div>

      <div style={{ height: 14 }} />
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Очередь модерации</span>
          <span className={`status ${data.pendingCreators.length + data.pendingCreatorProfiles.length + data.pendingOrders.length + data.pendingClients.length ? "warn" : "ok"}`}>
            {data.pendingCreators.length + data.pendingCreatorProfiles.length + data.pendingOrders.length + data.pendingClients.length} ожидают решения
          </span>
        </div>
        <div className="panel-body moderation-grid">
          <div>
            <h3 className="compact-title">Анкеты креаторов (на входе на платформу)</h3>
            {data.pendingCreators.length ? data.pendingCreators.map((creator) => (
              <div className="moderation-row" key={creator.id}>
                <div><b>{creator.firstName} {creator.lastName}</b><span>{creator.primaryRole} · @{creator.user.telegramUsername || "unknown"}</span></div>
                <div className="inline-actions"><button className="btn wine" disabled={busy} onClick={() => moderateCreator(creator.id, "APPROVED")}>Одобрить</button><button className="btn" disabled={busy} onClick={() => moderateCreator(creator.id, "REJECTED")}>Отклонить</button></div>
              </div>
            )) : <div className="empty compact">Анкет на модерации нет.</div>}
          </div>
          <div>
            <h3 className="compact-title">Анкеты заказчиков (на входе на платформу)</h3>
            {data.pendingClients.length ? data.pendingClients.map((client) => (
              <div className="moderation-row" key={client.id}>
                <div><b>{client.companyName}</b><span>{client.industry} · {client.contactName} · @{client.user.telegramUsername || "unknown"}</span></div>
                <div className="inline-actions"><button className="btn wine" disabled={busy} onClick={() => moderateClient(client.id, "APPROVED")}>Одобрить</button><button className="btn" disabled={busy} onClick={() => moderateClient(client.id, "REJECTED")}>Отклонить</button></div>
              </div>
            )) : <div className="empty compact">Анкет на модерации нет.</div>}
          </div>
          <div>
            <h3 className="compact-title">Исполнители (расширенная анкета исполнителя)</h3>
            {data.pendingCreatorProfiles.length ? data.pendingCreatorProfiles.map((creator) => (
              <div className="moderation-row" key={creator.id}>
                <div><b>{creator.firstName} {creator.lastName}</b><span>{creator.primaryRole} · {creator.category} · @{creator.user.telegramUsername || "unknown"}</span></div>
                <div className="inline-actions"><button className="btn wine" disabled={busy} onClick={() => moderateCreator(creator.id, "APPROVED")}>Одобрить</button><button className="btn" disabled={busy} onClick={() => moderateCreator(creator.id, "REJECTED")}>Отклонить</button></div>
              </div>
            )) : <div className="empty compact">Анкет на модерации нет.</div>}
          </div>
          <div>
            <h3 className="compact-title">Заказы (расширенная карточка заказа)</h3>
            {data.pendingOrders.length ? data.pendingOrders.map((order) => (
              <div className="moderation-row" key={order.id}>
                <div><b>{order.publicId} · {order.title}</b><span>{order.clientProfile.companyName} · {order.category}</span></div>
                <div className="inline-actions"><button className="btn wine" disabled={busy} onClick={() => moderateOrder(order.id, "PUBLISHED")}>Опубликовать</button><button className="btn" disabled={busy} onClick={() => moderateOrder(order.id, "REJECTED")}>Отклонить</button></div>
              </div>
            )) : <div className="empty compact">Заказов на модерации нет.</div>}
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Партнёрство</span>
          <button className="btn wine" type="button" onClick={() => setShowPartnerForm((current) => !current)}>
            {showPartnerForm ? <X size={16} /> : <Plus size={16} />} {showPartnerForm ? "Закрыть" : "Новая плашка"}
          </button>
        </div>
        <div className="panel-body">
          <p className="page-copy" style={{ marginTop: 0 }}>
            Заявки на партнёрство принимаются вручную (вне платформы). Креатор и заказчик
            не могут публиковать плашки из личного кабинета — только админ.
          </p>
          {showPartnerForm ? (
            <form className="panel" onSubmit={createPartner} style={{ marginBottom: 14 }}>
              <div className="panel-head">
                <span className="panel-title">Новая плашка</span>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  <div className="form-row">
                    <label>Название партнёра</label>
                    <input name="sponsorName" required minLength={2} placeholder="Например, Skillbox" />
                  </div>
                  <div className="form-row">
                    <label>Заголовок плашки</label>
                    <input name="title" required minLength={2} placeholder="Курс «Motion design с нуля»" />
                  </div>
                </div>
                <div className="form-row">
                  <label>Описание</label>
                  <textarea name="description" required minLength={5} placeholder="Короткий питч для карточки" />
                </div>
                <div className="form-grid">
                  <div className="form-row">
                    <label>Ссылка</label>
                    <input name="linkUrl" type="url" required placeholder="https://" />
                  </div>
                  <div className="form-row">
                    <label>Изображение (необязательно)</label>
                    <input name="imageUrl" type="url" placeholder="https://" />
                  </div>
                </div>
                <button className="btn wine" disabled={busy}>{busy ? "Публикуем..." : "Опубликовать"}</button>
              </div>
            </form>
          ) : null}
          {partners.length ? partners.map((partner) => (
            <div className="partner-admin-row" key={partner.id}>
              {partner.imageUrl ? (
                <div className="partner-admin-thumb"><img src={partner.imageUrl} alt="" /></div>
              ) : null}
              <div className="partner-admin-info">
                <b>{partner.sponsorName} · {partner.title}</b>
                <span>{partner.description}</span>
              </div>
              <div className="inline-actions">
                <span className={`status ${partner.active ? "ok" : "warn"}`}>{partner.active ? "Опубликовано" : "Скрыто"}</span>
                <button className="btn" disabled={busy} onClick={() => void togglePartner(partner)}>
                  {partner.active ? "Скрыть" : "Опубликовать"}
                </button>
                <button className="btn" disabled={busy} onClick={() => void deletePartner(partner.id)}>Удалить</button>
              </div>
            </div>
          )) : <div className="empty compact">Партнёрских плашек пока нет.</div>}
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Журнал рекомендаций</span>
          <span className="status">Последние 10 запусков</span>
        </div>
        <div className="panel-body">
          <table className="table">
            <thead><tr><th>Заказ</th><th>Система</th><th>Статус</th><th>Время</th><th>Результат</th></tr></thead>
            <tbody>
              {data.latestAiLogs.length ? data.latestAiLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <b>{log.order?.publicId || "Без заказа"}</b>
                    {log.order?.title ? <div className="muted">{log.order.title}</div> : null}
                  </td>
                  <td>{aiProviderName(log.provider)}</td>
                  <td><span className={`status ${aiLogStatus(log).className}`}>{aiLogStatus(log).label}</span></td>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td title={log.error || undefined}>{log.error || (log.provider === "local-fallback" ? "Топ-3 рассчитан локальным алгоритмом" : "Топ-3 рассчитан и сохранён")}</td>
                </tr>
              )) : <tr><td colSpan={5}>AI-подборы ещё не запускались</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Управление процессами</span><span className="status warn">Изменения применяются сразу</span></div>
          <div className="panel-body">
            {data.featureFlags.map((flag) => (
              <div className="job-card" key={flag.key} style={{ marginBottom: 10 }}>
                <div>
                  <div className="meta">{flagTitles[flag.key] || "Настройка"}</div>
                  <h3>{flag.enabled ? "Включено" : "Выключено"}</h3>
                  <p>{flag.description}</p>
                </div>
                <div className="job-actions">
                  <button className={`btn ${flag.enabled ? "" : "wine"}`} disabled={busy} onClick={() => toggleFlag(flag.key as keyof typeof flagMap, !flag.enabled)}>
                    {flag.enabled ? "Выключить" : "Включить"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Последние пользователи</span></div>
          <div className="panel-body">
            <table className="table">
              <thead><tr><th>Имя</th><th>Роль</th><th>Telegram</th></tr></thead>
              <tbody>
                {data.latestUsers.map((user) => (
                  <tr key={user.id}><td>{user.name}</td><td>{roleLabels[user.role] || user.role}</td><td>@{user.telegramUsername || "unknown"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Заказы</span></div>
          <div className="panel-body">
            <table className="table">
              <thead><tr><th>ID</th><th>Заказ</th><th>Компания</th><th>Источник</th><th>Статус</th><th>Отклики</th></tr></thead>
              <tbody>
                {data.latestOrders.map((order) => (
                  <tr key={order.id}><td>{order.publicId}</td><td>{order.title}</td><td>{order.clientProfile.companyName}</td><td>{orderInitiatorLabel(order.initiator)}</td><td>{statusLabel(order.status)}</td><td>{order._count.applications}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Платежи</span></div>
          <div className="panel-body">
            <table className="table">
              <thead><tr><th>Пользователь</th><th>Операция</th><th>Сумма</th><th>Статус</th></tr></thead>
              <tbody>
                {data.latestPayments.length ? data.latestPayments.map((payment) => (
                  <tr key={payment.id}><td>{payment.user.name}</td><td>{payment.package?.title || "Членство"}</td><td>{formatMoney(payment.amountCents)}</td><td>{statusLabel(payment.status)}</td></tr>
                )) : <tr><td colSpan={4}>Платежей пока нет</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
