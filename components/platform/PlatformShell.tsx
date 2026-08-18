"use client";

// Единый личный кабинет для CREATOR и CLIENT (ADMIN сюда не попадает — см.
// редирект в app/platform/page.tsx). Это не роутер страниц, а один large
// клиентский компонент с "панелями" (pane): текущая панель хранится в query
// ?pane=... (см. openPane/openOrder/openChat), меню в сайдбаре — это просто
// список панелей, доступных текущей роли (creatorMenu/clientMenu). Все данные
// кабинета (заказы, отклики, чаты, приглашения) грузятся один раз в
// refreshAll() и живут в состоянии этого компонента, а не в pane-компонентах —
// поэтому у каждой pane-функции ниже единая сигнатура (ctx: PaneContext).
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  Building2,
  Check,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Users
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { CreatorCatalog } from "@/components/catalog/CreatorCatalog";
import { CreatorProfileDialog } from "@/components/catalog/CreatorProfileDialog";
import { Avatar } from "@/components/ui/Avatar";
import { SelectControl } from "@/components/ui/SelectControl";
import { ThemeControl } from "@/components/ui/ThemeControl";
import { SPECIALIZATION_SUGGESTIONS, formatFileSize, orderInitiatorLabel, statusLabel } from "@/lib/presentation";
import type {
  ApiUser,
  Application,
  Chat,
  CreatorProfile,
  FeatureFlags,
  Invitation,
  Order,
  OrderPosition,
  PackagePlan
} from "@/lib/types";

type Bootstrap = {
  user: ApiUser | null;
  flags: FeatureFlags;
  packages: PackagePlan[];
  stats: { creators: number; publishedOrders: number };
};

type MenuItem = {
  id: string;
  label: string;
  group: string;
  icon: React.ReactNode;
};

const roleLabel = {
  CREATOR: "Креатор",
  CLIENT: "Заказчик",
  ADMIN: "Администратор"
};

function formatMoney(cents?: number | null) {
  if (!cents) return "Цена уточняется";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

async function responseError(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function creatorMenu(): MenuItem[] {
  return [
    { id: "overview", label: "Обзор", group: "Креатор", icon: <LayoutDashboard size={16} /> },
    { id: "jobs", label: "Вакансии", group: "Креатор", icon: <Briefcase size={16} /> },
    { id: "applications", label: "Мои отклики", group: "Креатор", icon: <Inbox size={16} /> },
    { id: "invites", label: "Приглашения", group: "Креатор", icon: <Sparkles size={16} /> },
    { id: "creatorOnboarding", label: "Анкета креатора", group: "Личный кабинет", icon: <FileText size={16} /> },
    { id: "chats", label: "Чаты по заказам", group: "Личный кабинет", icon: <MessageSquare size={16} /> },
    { id: "subscription", label: "Подписка", group: "Финансы", icon: <CreditCard size={16} /> },
    { id: "settings", label: "Настройки", group: "Личный кабинет", icon: <Settings size={16} /> }
  ];
}

function clientMenu(): MenuItem[] {
  return [
    { id: "overview", label: "Обзор", group: "Заказчик", icon: <LayoutDashboard size={16} /> },
    { id: "newOrder", label: "Создать заказ", group: "Заказчик", icon: <Plus size={16} /> },
    { id: "orders", label: "Мои заказы", group: "Заказчик", icon: <Briefcase size={16} /> },
    { id: "responses", label: "Отклики", group: "Заказчик", icon: <Inbox size={16} /> },
    { id: "catalog", label: "Каталог креаторов", group: "Заказчик", icon: <Users size={16} /> },
    { id: "companyOnboarding", label: "Карточка компании", group: "Личный кабинет", icon: <Building2 size={16} /> },
    { id: "chats", label: "Чаты по заказам", group: "Личный кабинет", icon: <MessageSquare size={16} /> },
    { id: "payments", label: "Оплата и пакеты", group: "Финансы", icon: <CreditCard size={16} /> },
    { id: "settings", label: "Настройки", group: "Личный кабинет", icon: <Settings size={16} /> }
  ];
}

export function PlatformShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPane = searchParams.get("pane") || "overview";
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [pane, setPane] = useState(initialPane);
  const [orders, setOrders] = useState<Order[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(searchParams.get("orderId"));
  const [activeChatId, setActiveChatId] = useState<string | null>(searchParams.get("chatId"));
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  const user = bootstrap?.user || null;

  const menu = useMemo(() => {
    return user?.role === "CLIENT" ? clientMenu() : creatorMenu();
  }, [user?.role]);

  const groupedMenu = useMemo(() => {
    return menu.reduce<Record<string, MenuItem[]>>((acc, item) => {
      acc[item.group] = acc[item.group] || [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, [menu]);

  async function loadBootstrap() {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить платформу"));
    const data = (await response.json()) as Bootstrap;
    setBootstrap(data);
    return data;
  }

  async function loadRoleData(currentUser: ApiUser) {
    const orderScope = currentUser.role === "CLIENT" ? "mine" : currentUser.role === "ADMIN" ? "admin" : "public";
    const [ordersResponse, applicationsResponse, invitationsResponse, chatsResponse] = await Promise.all([
      fetch(`/api/orders?scope=${orderScope}`),
      currentUser.role === "ADMIN" ? Promise.resolve(null) : fetch("/api/applications"),
      fetch("/api/invitations"),
      fetch("/api/chats")
    ]);

    if (!ordersResponse.ok) throw new Error(await responseError(ordersResponse, "Не удалось загрузить заказы"));
    if (applicationsResponse && !applicationsResponse.ok) {
      throw new Error(await responseError(applicationsResponse, "Не удалось загрузить отклики"));
    }
    if (!invitationsResponse.ok) {
      throw new Error(await responseError(invitationsResponse, "Не удалось загрузить приглашения"));
    }
    if (!chatsResponse.ok) throw new Error(await responseError(chatsResponse, "Не удалось загрузить чаты"));

    const ordersData = (await ordersResponse.json()) as { orders: Order[] };
    setOrders(ordersData.orders || []);

    if (applicationsResponse) {
      const appsData = (await applicationsResponse.json()) as { applications: Application[] };
      setApplications(appsData.applications || []);
    }

    const invitationsData = (await invitationsResponse.json()) as { invitations: Invitation[] };
    setInvitations(invitationsData.invitations || []);

    const chatsData = (await chatsResponse.json()) as { chats: Chat[] };
    setChats(chatsData.chats || []);
    setActiveChatId((current) =>
      current && chatsData.chats?.some((chat) => chat.id === current)
        ? current
        : chatsData.chats?.[0]?.id || null
    );
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  }

  function openPane(nextPane: string) {
    setPane(nextPane);
    router.replace(`/platform?pane=${nextPane}`, { scroll: false });
  }

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setPane("orderDetail");
    router.replace(`/platform?pane=orderDetail&orderId=${encodeURIComponent(orderId)}`, { scroll: false });
  }

  function openChat(chatId: string) {
    setActiveChatId(chatId);
    setPane("chats");
    router.replace(`/platform?pane=chats&chatId=${encodeURIComponent(chatId)}`, { scroll: false });
  }

  async function refreshAll() {
    try {
      setLoadError("");
      const nextBootstrap = await loadBootstrap();
      if (nextBootstrap.user) await loadRoleData(nextBootstrap.user);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не удалось обновить данные");
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const requestedPane = searchParams.get("pane") || "overview";
    setPane(requestedPane);
    setSelectedOrderId(searchParams.get("orderId"));
    const requestedChatId = searchParams.get("chatId");
    if (requestedChatId) setActiveChatId(requestedChatId);
  }, [searchParams]);

  useEffect(() => {
    const isClientOrderDetail = user?.role === "CLIENT" && pane === "orderDetail";
    if (user && !menu.some((item) => item.id === pane) && !isClientOrderDetail) {
      openPane("overview");
    }
  }, [user?.role, pane, menu]);

  if (!bootstrap && !loadError) {
    return <div className="section fill"><div className="loading">Загружаем кабинет...</div></div>;
  }

  if (!bootstrap) {
    return (
      <section className="section fill">
        <div className="panel">
          <div className="panel-body">
            <h2 className="page-title">Не удалось загрузить кабинет</h2>
            <p className="page-copy">{loadError}</p>
            <button className="btn wine" type="button" onClick={() => void refreshAll()} style={{ marginTop: 16 }}>
              Повторить
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="section fill">
        <div className="panel">
          <div className="panel-body">
            <div className="eyebrow">Требуется вход</div>
            <h2 className="page-title">Кабинет открывается через Telegram</h2>
            <p className="page-copy">Выберите роль и войдите, чтобы увидеть рабочие разделы платформы.</p>
            <div className="hero-actions">
              <Link className="btn wine" href="/login?role=creator">Войти как креатор</Link>
              <Link className="btn" href="/login?role=client">Войти как заказчик</Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (user.role !== "ADMIN") {
    const profile = user.role === "CREATOR" ? user.creatorProfile : user.clientProfile;
    if (!profile?.isApproved) {
      return <AccessGateScreen user={user} refreshAll={refreshAll} />;
    }
  }

  const paneContext = {
    pane,
    user,
    orders,
    applications,
    invitations,
    chats,
    selectedOrderId,
    activeChatId,
    setActiveChatId,
    setBusy,
    busy,
    refreshAll,
    showToast,
    openPane,
    openOrder,
    openChat,
    flags: bootstrap.flags
  };

  const content =
    user.role === "CREATOR"
      ? renderCreatorPane(paneContext)
      : renderClientPane({ ...paneContext, packages: bootstrap.packages });

  return (
    <section className="platform">
      <aside className="sidebar">
        <div className="side-user">
          <Avatar name={user.name} photoUrl={user.creatorProfile?.photoUrl} />
          <div>
            <b>{user.name}</b>
            <span>{roleLabel[user.role]}</span>
          </div>
        </div>
        {Object.entries(groupedMenu).map(([group, items]) => (
          <div className={`side-group ${group === "Финансы" ? "bottom" : ""}`} key={group}>
            <div className="side-title">{group}</div>
            {items.map((item) => (
              <button
                key={item.id}
                className={`sidebtn ${pane === item.id ? "active" : ""}`}
                onClick={() => openPane(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <div className="work">{content}</div>
      <div className={`toast ${toast || loadError ? "show" : ""}`} role="status">{toast || loadError}</div>
    </section>
  );
}

// Показывается вместо кабинета, пока анкета не в статусе isApproved=true
// (DRAFT/PAYMENT_PENDING/MODERATION/REJECTED — см. CreatorStatus/ClientStatus
// в schema.prisma). Единственное действие, доступное отсюда — оплата
// вступления при PAYMENT_PENDING; на MODERATION остаётся только "обновить статус".
function AccessGateScreen({ user, refreshAll }: { user: ApiUser; refreshAll: () => Promise<void> }) {
  const profile = user.role === "CREATOR" ? user.creatorProfile : user.clientProfile;
  const status = profile?.status || "DRAFT";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function payMembership() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "creator_membership" })
      });
      if (!response.ok) {
        setError(await responseError(response, "Не удалось активировать вступление"));
        return;
      }
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  const copy =
    status === "REJECTED"
      ? {
          title: "Заявка отклонена",
          text: "Администратор отклонил анкету. Если считаете это ошибкой, свяжитесь с поддержкой платформы."
        }
      : status === "PAYMENT_PENDING"
        ? {
            title: "Осталось оплатить вступление",
            text: "Анкета заполнена и не требует модерации. Чтобы получить доступ к кабинету, активируйте тестовое вступление."
          }
        : {
            title: "Заявка на рассмотрении",
            text: "Мы приняли анкету. Доступ к кабинету откроется, как только администратор одобрит заявку."
          };

  return (
    <section className="section fill">
      <div className="panel">
        <div className="panel-body">
          <div className="eyebrow">Личный кабинет</div>
          <h2 className="page-title">{copy.title}</h2>
          <p className="page-copy">{copy.text}</p>
          {error ? <div className="notice error-notice">{error}</div> : null}
          <div className="hero-actions" style={{ marginTop: 16 }}>
            {status === "PAYMENT_PENDING" ? (
              <button className="btn wine" type="button" onClick={() => void payMembership()} disabled={busy}>
                {busy ? "Оплачиваем..." : "Тестовое вступление"}
              </button>
            ) : null}
            <button className="btn" type="button" onClick={() => void refresh()} disabled={busy}>
              Обновить статус
            </button>
            <Link className="btn ghost" href="/">На главную</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

type PaneContext = {
  pane: string;
  user: ApiUser;
  orders: Order[];
  applications: Application[];
  invitations: Invitation[];
  chats: Chat[];
  selectedOrderId: string | null;
  activeChatId: string | null;
  setActiveChatId: (id: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
  refreshAll: () => Promise<void>;
  showToast: (message: string) => void;
  openPane: (pane: string) => void;
  openOrder: (orderId: string) => void;
  openChat: (chatId: string) => void;
  flags: FeatureFlags;
};

// renderCreatorPane/renderClientPane — простой роутер "id панели -> компонент".
// Добавление новой панели = новая запись в creatorMenu()/clientMenu() + новая
// ветка здесь + сам компонент ниже по файлу.
function renderCreatorPane(ctx: PaneContext) {
  if (ctx.pane === "creatorOnboarding") return <CreatorOnboarding {...ctx} />;
  if (ctx.pane === "jobs") return <CreatorJobs {...ctx} />;
  if (ctx.pane === "applications") return <CreatorApplications {...ctx} />;
  if (ctx.pane === "invites") return <InvitesPane {...ctx} />;
  if (ctx.pane === "chats") return <ChatPane {...ctx} />;
  if (ctx.pane === "subscription") return <CreatorSubscription {...ctx} />;
  if (ctx.pane === "settings") return <SettingsPane {...ctx} />;
  return <CreatorOverview {...ctx} />;
}

function renderClientPane(ctx: PaneContext & { packages: PackagePlan[]; flags: FeatureFlags }) {
  if (ctx.pane === "companyOnboarding") return <CompanyOnboarding {...ctx} />;
  if (ctx.pane === "newOrder") return <NewOrderPane {...ctx} />;
  if (ctx.pane === "orders") return <ClientOrders {...ctx} />;
  if (ctx.pane === "orderDetail") return <ClientOrderDetail {...ctx} />;
  if (ctx.pane === "responses") return <ClientResponses {...ctx} />;
  if (ctx.pane === "catalog") return <ClientCatalog {...ctx} />;
  if (ctx.pane === "chats") return <ChatPane {...ctx} />;
  if (ctx.pane === "payments") return <PaymentPane {...ctx} />;
  if (ctx.pane === "settings") return <SettingsPane {...ctx} />;
  return <ClientOverview {...ctx} />;
}

function CreatorOverview(ctx: PaneContext) {
  const appliedOrderIds = new Set(ctx.applications.map((application) => application.order?.id).filter(Boolean));
  const recommendedOrders = ctx.orders.filter(
    (order) => order.status === "PUBLISHED" && !appliedOrderIds.has(order.id)
  );
  const pendingInvitations = ctx.invitations.filter((invitation) => invitation.status === "SENT");

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Добро пожаловать, {ctx.user.creatorProfile?.firstName || ctx.user.name}</h2>
          <p className="page-copy">Новые вакансии, отклики и приглашения.</p>
        </div>
      </div>
      <div className="summary">
        <div className="metric"><span>Подходящие вакансии</span><b>{recommendedOrders.length}</b></div>
        <div className="metric"><span>Активные отклики</span><b>{ctx.applications.filter((item) => !["REJECTED", "ACCEPTED"].includes(item.status)).length}</b></div>
        <div className="metric"><span>Новые приглашения</span><b>{pendingInvitations.length}</b></div>
        <div className="metric"><span>Чаты по заказам</span><b>{ctx.chats.length}</b></div>
      </div>
      <div style={{ height: 14 }} />
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Рекомендованные вакансии</span></div>
          <div className="panel-body">
            {recommendedOrders.length
              ? recommendedOrders.slice(0, 2).map((order) => <JobSnippet key={order.id} order={order} />)
              : <div className="empty compact">Новых вакансий без отклика пока нет.</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Последняя активность</span></div>
          <div className="panel-body">
            {ctx.chats[0] ? <div className="feed-item"><div className="meta">{ctx.chats[0].order.publicId}</div><h3>Открыт чат по заказу</h3><p>{ctx.chats[0].order.title}</p></div> : null}
            {pendingInvitations[0] ? <div className="feed-item"><div className="meta">{pendingInvitations[0].order.publicId}</div><h3>Новое приглашение</h3><p>{pendingInvitations[0].order.title}</p></div> : null}
            {!ctx.chats.length && !pendingInvitations.length ? <div className="empty compact">Новых событий пока нет.</div> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function CreatorOnboarding(ctx: PaneContext) {
  const profile = ctx.user.creatorProfile;
  const [uploading, setUploading] = useState(false);
  const profileComplete = Boolean(profile?.firstName && profile.lastName && profile.bio && profile.expertise.length);
  const paymentComplete = !ctx.flags.paymentsRequired || Boolean(profile?.membershipPaid);
  const moderationComplete = !ctx.flags.moderationRequired || Boolean(profile?.isApproved);
  const completedSteps = [profileComplete, paymentComplete, moderationComplete, profileComplete && paymentComplete && moderationComplete].filter(Boolean).length;
  const progress = completedSteps * 25;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/profiles/creator", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: String(form.get("firstName")),
          lastName: String(form.get("lastName")),
          email: String(form.get("email")),
          city: String(form.get("city")),
          category: String(form.get("category")),
          primaryRole: String(form.get("primaryRole")),
          level: String(form.get("level")),
          experienceYears: Number(form.get("experienceYears")),
          expertise: String(form.get("expertise")).split(",").map((item) => item.trim()).filter(Boolean),
          bio: String(form.get("bio")),
          portfolioUrl: String(form.get("portfolioUrl")),
          cases: String(form.get("cases")),
          workFormat: String(form.get("workFormat")),
          availability: String(form.get("availability")),
          minBudget: Number(form.get("minBudget")),
          hourlyRate: Number(form.get("hourlyRate"))
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось сохранить анкету"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast(ctx.flags.moderationRequired ? "Анкета отправлена на модерацию" : "Анкета сохранена и опубликована");
    } finally {
      ctx.setBusy(false);
    }
  }

  async function payMembership() {
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/payments/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "creator_membership" })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось активировать вступление"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Тестовое вступление активировано");
    } finally {
      ctx.setBusy(false);
    }
  }

  async function uploadPortfolio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const response = await fetch("/api/files/portfolio", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось загрузить файл"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Файл добавлен в портфолио");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Анкета креатора</h2>
          <p className="page-copy">Профиль, по которому заказчики и AI находят подходящих специалистов.</p>
        </div>
        <span className={`status ${profile?.isApproved ? "ok" : "warn"}`}>{statusLabel(profile?.status || "DRAFT")}</span>
      </div>
      <div className="onboarding">
        <div className="onboarding-steps">
          <div className="meta">Прогресс {progress}%</div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <div className={`on-step ${profileComplete ? "done" : "active"}`}><b>01</b> Профессиональная анкета</div>
          <div className={`on-step ${paymentComplete ? "done" : "active"}`}><b>02</b> {ctx.flags.paymentsRequired ? "Оплата вступления" : "Оплата отключена"}</div>
          <div className={`on-step ${moderationComplete ? "done" : "active"}`}><b>03</b> {ctx.flags.moderationRequired ? "Модерация" : "Модерация отключена"}</div>
          <div className={`on-step ${progress === 100 ? "done" : ""}`}><b>04</b> Доступ к платформе</div>
        </div>
        <form className="panel" onSubmit={submit}>
          <div className="panel-body">
            <div className="form-section">
              <h3>Основная информация</h3>
              <div className="form-grid">
                <div className="form-row">
                  <label>Файлы портфолио</label>
                  <label className="upload interactive">
                    <input className="visually-hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4" onChange={uploadPortfolio} disabled={uploading} />
                    {uploading ? "Загружаем..." : "Выбрать PDF, изображение или MP4 до 15 МБ"}
                  </label>
                  <div className="file-list">
                    {profile?.files?.map((file) => (
                      <a className="file-row" href={file.url} target="_blank" rel="noreferrer" key={file.id}>
                        <FileText size={15} /><span>{file.fileName}</span><small>{formatFileSize(file.size)}</small>
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="form-row"><label>Имя</label><input name="firstName" defaultValue={profile?.firstName || "Анна"} /></div>
                  <div className="form-row"><label>Фамилия</label><input name="lastName" defaultValue={profile?.lastName || "Ким"} /></div>
                  <div className="form-row"><label>Telegram</label><input value={`@${ctx.user.telegramUsername || "annakim"}`} disabled /></div>
                  <div className="form-row"><label>Email</label><input name="email" type="email" defaultValue={ctx.user.email || ""} placeholder="name@example.com" /></div>
                </div>
                <div className="form-row"><label>Город</label><input name="city" defaultValue={profile?.city || "Москва"} /></div>
                <div className="form-row"><label>Портфолио</label><input name="portfolioUrl" defaultValue={profile?.portfolioUrl || "https://portfolio.example"} /></div>
              </div>
            </div>
            <div className="form-section">
              <h3>Специализация</h3>
              <div className="form-grid">
                <div className="form-row"><label>Категория</label><SelectControl name="category" defaultValue={profile?.category || "Дизайн"}><option>Дизайн</option><option>Видео</option><option>Креатив</option><option>AI</option><option>Маркетинг</option></SelectControl></div>
                <div className="form-row">
                  <label>Основная роль</label>
                  <input name="primaryRole" list="profile-specialization-suggestions" defaultValue={profile?.primaryRole || "Motion / 3D designer"} />
                  <datalist id="profile-specialization-suggestions">
                    {SPECIALIZATION_SUGGESTIONS.map((item) => <option value={item} key={item} />)}
                  </datalist>
                </div>
                <div className="form-row"><label>Уровень</label><SelectControl name="level" defaultValue={profile?.level || "Senior"}><option>Junior</option><option>Middle</option><option>Senior</option></SelectControl></div>
                <div className="form-row"><label>Опыт, лет</label><input name="experienceYears" type="number" defaultValue={profile?.experienceYears || 7} /></div>
                <div className="form-row full"><label>Дополнительные навыки через запятую</label><textarea name="expertise" defaultValue={(profile?.expertise || ["3D", "Motion", "Fashion"]).join(", ")} placeholder="То, что умеешь помимо основной роли — теги через запятую" /></div>
              </div>
            </div>
            <div className="form-section">
              <h3>О себе и условия</h3>
              <div className="form-row"><label>О себе</label><textarea name="bio" defaultValue={profile?.bio || "Создаю визуальные системы и 3D-ролики для брендов."} /></div>
              <div className="form-row"><label>Кейсы</label><textarea name="cases" defaultValue={profile?.cases || "1. Fashion campaign\n2. 3D product film\n3. Brand launch"} /></div>
              <div className="form-grid">
                <div className="form-row"><label>Формат</label><SelectControl name="workFormat" defaultValue={profile?.workFormat || "Проект"}><option>Проект</option><option>Part-time</option></SelectControl></div>
                <div className="form-row"><label>Доступность</label><SelectControl name="availability" defaultValue={profile?.availability || "available"}><option value="available">Свободен сейчас</option><option value="soon">Свободен скоро</option></SelectControl></div>
                <div className="form-row"><label>Минимальный чек, ₽</label><input name="minBudget" type="number" defaultValue={profile?.minBudget || 180000} /></div>
                <div className="form-row"><label>Ставка, ₽/час</label><input name="hourlyRate" type="number" defaultValue={profile?.hourlyRate || 10000} /></div>
              </div>
            </div>
            <div className="hero-actions">
              <button className="btn wine" disabled={ctx.busy}>{ctx.busy ? "Сохраняем..." : "Сохранить анкету"}</button>
              {ctx.flags.paymentsRequired && !profile?.membershipPaid ? <button className="btn" type="button" onClick={payMembership} disabled={ctx.busy}>Тестовое вступление</button> : <span className="status ok">Оплата не блокирует доступ</span>}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

// Вакансия — одна позиция, отклик выглядит как раньше (одна кнопка на весь
// пост). Проект — своя кнопка/статус на каждую позицию (включая
// волонтёрскую, если заказчик её открыл), поэтому цель отклика — не сам
// заказ, а конкретная позиция внутри него (см. OrderPosition в lib/types.ts).
function CreatorJobs(ctx: PaneContext) {
  const [selectedTarget, setSelectedTarget] = useState<{ order: Order; position: OrderPosition } | null>(null);
  const appliedByPosition = new Map(
    ctx.applications
      .filter((application) => application.positionId)
      .map((application) => [application.positionId as string, application])
  );

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTarget) return;
    const form = new FormData(event.currentTarget);
    ctx.setBusy(true);
    try {
      const price = Number(form.get("price"));
      const response = await fetch(`/api/orders/${selectedTarget.order.id}/applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: String(form.get("message")),
          relevantCase: String(form.get("relevantCase")),
          priceCents: price > 0 ? price * 100 : undefined,
          duration: String(form.get("duration")),
          positionId: selectedTarget.position.id
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось отправить отклик"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Отклик отправлен");
      ctx.openPane("applications");
    } finally {
      ctx.setBusy(false);
    }
  }

  function positionAction(order: Order, position: OrderPosition) {
    const application = appliedByPosition.get(position.id);
    return application
      ? <span className="status ok">{statusLabel(application.status)}</span>
      : <button className="btn wine" type="button" onClick={() => setSelectedTarget({ order, position })} disabled={ctx.busy}>{position.isVolunteer ? "Откликнуться волонтёром" : "Откликнуться"}</button>;
  }

  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Вакансии</h2><p className="page-copy">Отклик доступен участнику платформы и создает основу для чата внутри заказа. В проектах — своя кнопка на каждую позицию.</p></div>
      </div>
      {selectedTarget ? (
        <form className="panel application-form" onSubmit={apply}>
          <div className="panel-head"><span className="panel-title">Отклик на {selectedTarget.order.publicId}{selectedTarget.order.kind === "PROJECT" ? ` · ${selectedTarget.position.title}` : ""}</span><button className="btn ghost" type="button" onClick={() => setSelectedTarget(null)}>Отмена</button></div>
          <div className="panel-body">
            <div className="form-row"><label>Почему вы подходите</label><textarea name="message" minLength={10} required defaultValue="Подходит мой опыт и портфолио. Готов(а) обсудить бриф и показать релевантные кейсы." /></div>
            <div className="form-grid">
              <div className="form-row"><label>Релевантный кейс</label><input name="relevantCase" type="url" defaultValue={ctx.user.creatorProfile?.portfolioUrl || ""} /></div>
              <div className="form-row"><label>Стоимость, ₽</label><input name="price" type="number" min="1" defaultValue={ctx.user.creatorProfile?.minBudget || 100000} /></div>
              <div className="form-row"><label>Срок</label><input name="duration" required defaultValue={selectedTarget.order.deadline} /></div>
            </div>
            <button className="btn wine" disabled={ctx.busy}>{ctx.busy ? "Отправляем..." : "Отправить отклик"}</button>
          </div>
        </form>
      ) : null}
      <div className="panel"><div className="panel-body">
        {ctx.orders.length ? ctx.orders.map((order) => {
          const positions = order.positions || [];
          const action = !positions.length ? null : order.kind === "PROJECT" ? (
            <div className="position-actions">
              {positions.map((position) => (
                <div className="position-action-row" key={position.id}>
                  <span className="position-name">{position.title}{position.isVolunteer ? <span className="chip">волонтёр</span> : null}</span>
                  {positionAction(order, position)}
                </div>
              ))}
            </div>
          ) : positionAction(order, positions[0]);
          return <JobSnippet key={order.id} order={order} action={action} />;
        }) : <div className="empty compact">Опубликованных вакансий пока нет.</div>}
      </div></div>
    </>
  );
}

function JobSnippet({ order, action }: { order: Order; action?: React.ReactNode }) {
  return (
    <div className="job">
      <div className="meta">{order.publicId} · {order.category}</div>
      <h3>{order.title}</h3>
      <p>{order.description}</p>
      <div className="job-tags"><span className="chip">{orderInitiatorLabel(order.initiator)}</span><span className="chip">{order.budget}</span><span className="chip">{order.deadline}</span><span className="chip">{statusLabel(order.status)}</span></div>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

function CreatorApplications(ctx: PaneContext) {
  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Мои отклики</h2><p className="page-copy">Чат появляется только после отклика и открытия коммуникации заказчиком.</p></div>
      </div>
      <div className="panel">
        <div className="panel-body">
          {ctx.applications.length ? ctx.applications.map((application) => (
            <div className="job-card" key={application.id}>
              <div>
                <div className="meta">{application.order?.publicId}</div>
                <h3>{application.order?.title}</h3>
                <p>{application.message}</p>
                <div className="job-tags"><span className={`status ${application.chat ? "ok" : "warn"}`}>{application.chat ? "Чат открыт" : statusLabel(application.status)}</span>{application.duration ? <span className="chip">{application.duration}</span> : null}{application.priceCents ? <span className="chip">{formatMoney(application.priceCents)}</span> : null}</div>
              </div>
              <div className="job-actions">{application.chat ? <button className="btn wine" onClick={() => ctx.openChat(application.chat!.id)}>Открыть чат</button> : <span className="status warn">На рассмотрении</span>}</div>
            </div>
          )) : <div className="empty">Откликов пока нет.</div>}
        </div>
      </div>
    </>
  );
}

function InvitesPane(ctx: PaneContext) {
  async function decide(invitation: Invitation, status: "ACCEPTED" | "DECLINED") {
    ctx.setBusy(true);
    try {
      const response = await fetch(`/api/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось обработать приглашение"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast(status === "ACCEPTED" ? "Приглашение принято, отклик создан" : "Приглашение отклонено");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Приглашения</h2><p className="page-copy">Заказчики могут пригласить вас откликнуться на конкретный заказ.</p></div></div>
      <div className="panel"><div className="panel-body">
        {ctx.invitations.length ? ctx.invitations.map((invitation) => (
          <div className="job-card" key={invitation.id}>
            <div>
              <div className="meta">Приглашение · {invitation.order.publicId}</div>
              <h3>{invitation.order.title}</h3>
              <p>{invitation.message}</p>
              <div className="job-tags"><span className="chip">{invitation.order.budget}</span><span className="chip">{invitation.order.deadline}</span><span className={`status ${invitation.status === "ACCEPTED" ? "ok" : "warn"}`}>{statusLabel(invitation.status)}</span></div>
            </div>
            {invitation.status === "SENT" ? <div className="job-actions"><button className="btn wine" onClick={() => decide(invitation, "ACCEPTED")} disabled={ctx.busy}>Принять</button><button className="btn" onClick={() => decide(invitation, "DECLINED")} disabled={ctx.busy}>Отклонить</button></div> : null}
          </div>
        )) : <div className="empty compact">Новых приглашений пока нет.</div>}
      </div></div>
    </>
  );
}

// В отличие от пакетов заказчика (Package в БД, см. seed.ts), подписка
// креатора — один фиксированный тариф без записи в БД: цена и список плюсов
// заданы здесь константами. Оплата всё равно идёт через тот же
// /api/payments/test (purpose: "creator_membership") и включает
// membershipPaid на CreatorProfile, см. lib/payments.ts.
// 500 ₽/мес — ориентир с планирования: посмотрели цены аналогов
// (HH/Хирихи/Herify и т.п. — там подписки в районе 500 ₽), выше смысла
// ставить нет, единый тариф без скрытых условий.
const CREATOR_SUBSCRIPTION_PRICE_CENTS = 50000;

const CREATOR_SUBSCRIPTION_PERKS = [
  "Профиль виден заказчикам в открытой ленте креаторов",
  "Контакты открыты для заказчиков без ограничений",
  "Приглашения от брендов на подходящие заказы",
  "Участие в AI-подборе топ-3 по вакансиям",
  "Отклики на вакансии и чаты по каждому заказу"
];

function CreatorSubscription(ctx: PaneContext) {
  const profile = ctx.user.creatorProfile;
  const active = Boolean(profile?.membershipPaid);

  async function subscribe() {
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/payments/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "creator_membership", amountCents: CREATOR_SUBSCRIPTION_PRICE_CENTS })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось оформить подписку"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Подписка активирована");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Подписка</h2>
          <p className="page-copy">Подписка открывает профиль в ленте и снимает ограничения на контакты и отклики.</p>
        </div>
        <span className={`status ${active ? "ok" : "warn"}`}>{active ? "Активна" : "Не активна"}</span>
      </div>
      <div className="package-grid plan-grid-single">
        <div className="package plan-card">
          <div className="meta">Ежемесячно</div>
          <h3>Подписка креатора</h3>
          <p>Единый тариф без скрытых условий: одна подписка открывает весь функционал платформы.</p>
          <div className="price">{formatMoney(CREATOR_SUBSCRIPTION_PRICE_CENTS)}<span className="price-period">/мес</span></div>
          <ul className="perks">
            {CREATOR_SUBSCRIPTION_PERKS.map((perk) => (
              <li key={perk}><Check size={14} /><span>{perk}</span></li>
            ))}
          </ul>
          <button className="btn wine" type="button" onClick={subscribe} disabled={ctx.busy || active}>
            {active ? "Подписка активна" : ctx.busy ? "Оформляем..." : "Оформить подписку"}
          </button>
        </div>
      </div>
    </>
  );
}

function ClientOverview(ctx: PaneContext) {
  const activeOrders = ctx.orders.filter((order) => !["COMPLETED", "ARCHIVED", "REJECTED"].includes(order.status));
  const newApplications = ctx.applications.filter((application) => application.status === "SENT");
  const latestApplication = ctx.applications[0];
  const latestAiOrder = ctx.orders.find((order) => order.aiMatches?.length);

  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">{ctx.user.clientProfile?.companyName || "Компания"}</h2><p className="page-copy">Заказы, отклики, AI-рекомендации и доступ к базе.</p></div>
        <button className="btn wine" onClick={() => ctx.openPane("newOrder")}><Plus size={16} /> Новый заказ</button>
      </div>
      <div className="summary">
        <div className="metric"><span>Активные заказы</span><b>{activeOrders.length}</b></div>
        <div className="metric"><span>Новые отклики</span><b>{newApplications.length}</b></div>
        <div className="metric"><span>AI-подборы готовы</span><b>{ctx.orders.filter((order) => order.aiMatches?.length).length}</b></div>
        <div className="metric"><span>Чаты по заказам</span><b>{ctx.chats.length}</b></div>
      </div>
      <div style={{ height: 14 }} />
      <div className="grid two">
        <div className="panel"><div className="panel-head"><span className="panel-title">Последняя активность</span></div><div className="panel-body">
          {latestApplication ? <div className="feed-item"><div className="meta">{latestApplication.order?.publicId}</div><h3>Отклик от {latestApplication.creatorProfile?.firstName} {latestApplication.creatorProfile?.lastName}</h3><p>{latestApplication.order?.title}</p></div> : null}
          {latestAiOrder ? <div className="feed-item"><div className="meta">{latestAiOrder.publicId}</div><h3>AI-топ-3 готов</h3><p>{latestAiOrder.title}</p></div> : null}
          {!latestApplication && !latestAiOrder ? <div className="empty compact">Новых событий пока нет.</div> : null}
        </div></div>
        <AiBox order={latestAiOrder || activeOrders[0]} />
      </div>
    </>
  );
}

function AiBox({ order, onProfile }: { order?: Order; onProfile?: (creator: CreatorProfile) => void }) {
  return (
    <div className="ai-box">
      <div className="meta">{order?.publicId || "ORD"}</div>
      <h3>Топ-3 креатора</h3>
      <p>{order ? `Подбор только для заказа «${order.title}».` : "Выберите заказ, чтобы сформировать подбор."}</p>
      {order?.aiMatches?.length ? order.aiMatches.map((match) => (
        <div className="ai-person" key={match.id}>
          <Avatar name={`${match.creatorProfile.firstName} ${match.creatorProfile.lastName}`} photoUrl={match.creatorProfile.photoUrl} />
          <div><b>{match.rank}. {match.creatorProfile.firstName} {match.creatorProfile.lastName}</b><div className="meta">{match.creatorProfile.primaryRole}</div></div>
          <span className="score">{match.score}%</span>
          <small className="ai-rationale">{match.rationale}</small>
          {onProfile ? <button className="btn ghost ai-profile-action" type="button" onClick={() => onProfile(match.creatorProfile)}>Профиль</button> : null}
        </div>
      )) : <div className="notice">AI-подбор еще не запускался.</div>}
    </div>
  );
}

function CompanyOnboarding(ctx: PaneContext) {
  const profile = ctx.user.clientProfile;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/profiles/client", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: String(form.get("companyName")),
          website: String(form.get("website")),
          industry: String(form.get("industry")),
          description: String(form.get("description")),
          contactName: String(form.get("contactName")),
          contactTitle: String(form.get("contactTitle")),
          legalType: String(form.get("legalType")),
          inn: String(form.get("inn")),
          email: String(form.get("email"))
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось сохранить карточку"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Карточка компании сохранена");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Карточка компании</h2><p className="page-copy">Данные компании перед созданием и оплатой заказа.</p></div><span className="status ok">Доступна</span></div>
      <form className="panel" onSubmit={submit}><div className="panel-body">
        <div className="form-section"><h3>Компания</h3><div className="form-grid">
          <div className="form-row"><label>Логотип</label><div className="upload">Загрузить логотип</div></div>
          <div><div className="form-row"><label>Название</label><input name="companyName" defaultValue={profile?.companyName || "NORTH STUDIO"} /></div><div className="form-row"><label>Сайт</label><input name="website" defaultValue={profile?.website || "north.example"} /></div><div className="form-row"><label>Отрасль</label><input name="industry" defaultValue={profile?.industry || "Fashion / E-commerce"} /></div></div>
          <div className="form-row full"><label>Описание компании</label><textarea name="description" defaultValue={profile?.description || "Независимый бренд и digital-команда."} /></div>
        </div></div>
        <div className="form-section"><h3>Контактное лицо</h3><div className="form-grid">
          <div className="form-row"><label>Имя</label><input name="contactName" defaultValue={profile?.contactName || "Никита Романов"} /></div>
          <div className="form-row"><label>Должность</label><input name="contactTitle" defaultValue={profile?.contactTitle || "Founder"} /></div>
          <div className="form-row"><label>Telegram</label><input value={`@${ctx.user.telegramUsername || "northfounder"}`} disabled /></div>
          <div className="form-row"><label>Email</label><input name="email" type="email" defaultValue={ctx.user.email || ""} placeholder="hello@company.ru" /></div>
        </div></div>
        <div className="form-section"><h3>Реквизиты</h3><div className="form-grid"><div className="form-row"><label>Тип</label><SelectControl name="legalType" defaultValue={profile?.legalType || "Юридическое лицо"}><option>Юридическое лицо</option><option>ИП</option><option>Самозанятый</option></SelectControl></div><div className="form-row"><label>ИНН</label><input name="inn" defaultValue={profile?.inn || "7700000000"} /></div></div></div>
        <button className="btn wine" disabled={ctx.busy}>Сохранить карточку</button>
      </div></form>
    </>
  );
}

// Вакансия — один отклик на весь пост (ищем одного специалиста). Проект —
// сборка команды: заказчик перечисляет несколько именованных позиций, у
// каждой свой независимый отклик (см. OrderKind/OrderPosition в
// schema.prisma). Переключатель ниже меняет и вид формы (поле "Название"
// вместо этого становится общим заголовком проекта), и то, что уходит в
// POST /api/orders.
function NewOrderPane(ctx: PaneContext) {
  const [kind, setKind] = useState<"VACANCY" | "PROJECT">("VACANCY");
  const [positions, setPositions] = useState<string[]>(["", ""]);
  const [acceptsVolunteers, setAcceptsVolunteers] = useState(false);

  function updatePosition(index: number, value: string) {
    setPositions((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function addPosition() {
    setPositions((prev) => [...prev, ""]);
  }

  function removePosition(index: number) {
    setPositions((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const cleanPositions = positions.map((title) => title.trim()).filter(Boolean);
    if (kind === "PROJECT" && cleanPositions.length === 0) {
      ctx.showToast("Добавьте хотя бы одну позицию для проекта");
      return;
    }
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title")),
          category: String(form.get("category")),
          description: String(form.get("description")),
          requirements: String(form.get("requirements")),
          budget: String(form.get("budget")),
          deadline: String(form.get("deadline")),
          initiator: String(form.get("initiator")),
          kind,
          positions: kind === "PROJECT" ? cleanPositions : undefined,
          acceptsVolunteers: kind === "PROJECT" && acceptsVolunteers
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось создать заказ"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast(
        ctx.flags.paymentsRequired
          ? "Заказ создан. Оплатите публикацию, чтобы он появился в ленте."
          : ctx.flags.moderationRequired
            ? "Заказ отправлен на модерацию"
            : "Заказ опубликован"
      );
      ctx.openPane("orders");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Создать заказ</h2><p className="page-copy">Опишите задачу и укажите, от чьего имени опубликован запрос.</p></div></div>
      <form className="panel" onSubmit={submit}><div className="panel-body">
        <div className="form-row">
          <label>Тип поста</label>
          <div className="segmented-control" role="radiogroup" aria-label="Тип поста">
            <button type="button" className={kind === "VACANCY" ? "active" : ""} onClick={() => setKind("VACANCY")}>Вакансия · один отклик</button>
            <button type="button" className={kind === "PROJECT" ? "active" : ""} onClick={() => setKind("PROJECT")}>Проект · сборка команды</button>
          </div>
          <p className="field-hint">{kind === "VACANCY" ? "Ищете одного специалиста — на пост будет одна кнопка отклика." : "Заведите несколько позиций (например, «Дизайнер», «Копирайтер») — у каждой своя кнопка отклика."}</p>
        </div>
        <div className="form-grid"><div className="form-row"><label>{kind === "VACANCY" ? "Название" : "Название проекта"}</label><input name="title" minLength={3} maxLength={150} required placeholder="Например, айдентика для нового бренда" /></div><div className="form-row"><label>Категория</label><SelectControl name="category" defaultValue="Дизайн"><option>Дизайн</option><option>Видео</option><option>Тексты</option><option>Маркетинг</option><option>Креатив</option><option>AI</option><option>Менеджмент</option></SelectControl></div></div>
        {kind === "PROJECT" ? (
          <div className="form-row">
            <label>Позиции проекта</label>
            <div className="position-list">
              {positions.map((title, index) => (
                <div className="position-row" key={index}>
                  <input
                    value={title}
                    maxLength={120}
                    placeholder={`Например, «${index === 0 ? "Дизайнер" : "Копирайтер"}»`}
                    onChange={(event) => updatePosition(index, event.target.value)}
                  />
                  <button type="button" className="btn ghost icon" onClick={() => removePosition(index)} disabled={positions.length <= 1} aria-label="Убрать позицию">×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn ghost" onClick={addPosition}>+ Добавить позицию</button>
            <label className="checkbox-row">
              <input type="checkbox" checked={acceptsVolunteers} onChange={(event) => setAcceptsVolunteers(event.target.checked)} />
              <span>Разрешить волонтёрские отклики (без оплаты, для портфолио)</span>
            </label>
          </div>
        ) : null}
        <div className="form-row"><label>От кого заказ</label><SelectControl name="initiator" defaultValue="CLIENT"><option value="CLIENT">От заказчика</option><option value="CREATOR">От креатора</option></SelectControl></div>
        {/* Лимит по символам — чтобы не превращалось в простыню (см. комментарий у createOrderSchema в app/api/orders/route.ts) */}
        <div className="form-row"><label>Описание и ожидаемый результат</label><textarea name="description" minLength={10} maxLength={6000} required placeholder="Опишите задачу, контекст и ожидаемый результат (до 6000 символов)" /></div>
        <div className="form-grid"><div className="form-row"><label>Бюджет</label><input name="budget" maxLength={120} required placeholder="Например, 180–250 тыс. ₽" /></div><div className="form-row"><label>Срок</label><input name="deadline" maxLength={120} required placeholder="Например, 3 недели" /></div></div>
        <div className="form-row"><label>Требования</label><textarea name="requirements" minLength={3} maxLength={3000} required placeholder="Опыт, навыки, обязательные материалы (до 3000 символов)" /></div>
        <button className="btn wine" disabled={ctx.busy}>{ctx.flags.paymentsRequired ? "Сохранить и перейти к оплате" : ctx.flags.moderationRequired ? "Сохранить и отправить на модерацию" : "Сохранить и опубликовать"}</button>
      </div></form>
    </>
  );
}

async function runAiForOrder(ctx: PaneContext, order: Order) {
  ctx.setBusy(true);
  try {
    const response = await fetch("/api/ai/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: order.id })
    });
    if (!response.ok) {
      ctx.showToast(await responseError(response, "Не удалось обновить рекомендации"));
      return;
    }
    await ctx.refreshAll();
    ctx.showToast(`AI-топ-3 для ${order.publicId} обновлен`);
  } finally {
    ctx.setBusy(false);
  }
}

async function payOrderPublication(ctx: PaneContext, order: Order) {
  ctx.setBusy(true);
  try {
    const response = await fetch("/api/payments/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "order_publish", orderId: order.id })
    });
    if (!response.ok) {
      ctx.showToast(await responseError(response, "Не удалось оплатить публикацию"));
      return;
    }
    await ctx.refreshAll();
    ctx.showToast(`Публикация ${order.publicId} оплачена`);
  } finally {
    ctx.setBusy(false);
  }
}

// Заказчик сам отмечает заказ выполненным (см. PATCH /api/orders/[id] —
// клиенту разрешён только переход в COMPLETED, остальные статусы — только
// админ/модерация). Именно это открывает возможность оценить исполнителей
// (см. recommendApplication ниже).
async function completeOrder(ctx: PaneContext, order: Order) {
  ctx.setBusy(true);
  try {
    const response = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" })
    });
    if (!response.ok) {
      ctx.showToast(await responseError(response, "Не удалось отметить заказ выполненным"));
      return;
    }
    await ctx.refreshAll();
    ctx.showToast(`${order.publicId} отмечен выполненным. Теперь можно оценить исполнителей.`);
  } finally {
    ctx.setBusy(false);
  }
}

// "Рекомендую / не рекомендую" по конкретному отклику — вместо звёздного
// рейтинга (см. комментарий у Application.clientRecommended в
// schema.prisma). Доступно только после того, как заказ переведён в
// COMPLETED (см. completeOrder выше).
async function recommendApplication(ctx: PaneContext, application: Application, recommended: boolean) {
  ctx.setBusy(true);
  try {
    const response = await fetch(`/api/applications/${application.id}/recommend`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommended })
    });
    if (!response.ok) {
      ctx.showToast(await responseError(response, "Не удалось сохранить оценку"));
      return;
    }
    await ctx.refreshAll();
    ctx.showToast(recommended ? "Отметили: рекомендуете исполнителя" : "Отметили: не рекомендуете исполнителя");
  } finally {
    ctx.setBusy(false);
  }
}

async function openApplicationChat(ctx: PaneContext, application: Application) {
  ctx.setBusy(true);
  try {
    const response = await fetch("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: application.id })
    });
    if (!response.ok) {
      ctx.showToast(await responseError(response, "Не удалось открыть чат"));
      return;
    }
    const data = (await response.json()) as { chat: Chat };
    await ctx.refreshAll();
    ctx.showToast(application.chat ? "Чат открыт" : "Чат создан внутри заказа");
    ctx.openChat(data.chat.id);
  } finally {
    ctx.setBusy(false);
  }
}

function ClientOrders(ctx: PaneContext) {
  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Мои заказы</h2><p className="page-copy">Откройте заказ, чтобы увидеть только его отклики, AI-рекомендации и чаты.</p></div><button className="btn wine" onClick={() => ctx.openPane("newOrder")}>Новый заказ</button></div>
      <div style={{ display: "grid", gap: 12 }}>{ctx.orders.length ? ctx.orders.map((order) => (
        <div className="job-card" key={order.id}>
          <div><div className="meta">{order.publicId} · {order.category}</div><h3>{order.title}</h3><p>{order.description}</p><div className="job-tags"><span className={`status ${order.status === "PUBLISHED" ? "ok" : "warn"}`}>{statusLabel(order.status)}</span><span className="chip">{orderInitiatorLabel(order.initiator)}</span><span className="chip">{order._count?.applications || order.applications?.length || 0} откликов</span><span className="chip">Рекомендации: {order.aiMatches?.length || 0}</span><span className="chip">{order.budget}</span></div></div>
          <div className="job-actions">
            {order.status === "PAYMENT_PENDING" ? (
              <button className="btn wine" onClick={() => void payOrderPublication(ctx, order)} disabled={ctx.busy}>Оплатить публикацию</button>
            ) : null}
            <button className="btn" onClick={() => ctx.openOrder(order.id)}>Открыть заказ</button>
          </div>
        </div>
      )) : <div className="empty">Заказов пока нет. Создайте первый бриф.</div>}</div>
    </>
  );
}

function ApplicationRow({
  application,
  ctx,
  onProfile,
  showOrderLink
}: {
  application: Application;
  ctx: PaneContext;
  onProfile: (creator: CreatorProfile) => void;
  showOrderLink?: boolean;
}) {
  const creator = application.creatorProfile;
  if (!creator) return null;

  return (
    <div className="application">
      <Avatar name={`${creator.firstName} ${creator.lastName}`} photoUrl={creator.photoUrl} />
      <div className="application-main">
        <b>{creator.firstName} {creator.lastName}</b>
        {application.order ? <div className="meta">{application.order.publicId} · {application.order.title}</div> : null}
        <div className="application-copy">{application.message}</div>
        <div className="job-tags">
          <span className="chip">{creator.primaryRole} · {creator.level}</span>
          {/* Позиция актуальна только для проекта — у вакансии она одна и
              так понятна из заголовка заказа, повторять её незачем. */}
          {application.order?.kind === "PROJECT" && application.position ? <span className="chip">{application.position.title}</span> : null}
          {application.priceCents ? <span className="chip">{formatMoney(application.priceCents)}</span> : null}
          {application.duration ? <span className="chip">{application.duration}</span> : null}
          <span className={`status ${application.chat ? "ok" : "warn"}`}>{statusLabel(application.status)}</span>
        </div>
      </div>
      <div className="actions">
        {showOrderLink && application.order ? <button className="btn" type="button" onClick={() => ctx.openOrder(application.order!.id)}>Заказ</button> : null}
        <button className="btn" type="button" onClick={() => onProfile(creator)}>Профиль</button>
        <button className="btn wine" type="button" onClick={() => void openApplicationChat(ctx, application)} disabled={ctx.busy}>{application.chat ? "Открыть чат" : "Начать чат"}</button>
        {/* Оценка "рекомендую/не рекомендую" доступна заказчику только после
            того, как сам заказ отмечен выполненным (см. completeOrder выше) —
            до этого момента оценивать нечего. */}
        {ctx.user.role === "CLIENT" && application.order?.status === "COMPLETED" ? (
          application.clientRecommended === null || application.clientRecommended === undefined ? (
            <div className="recommend-row">
              <button className="btn" type="button" onClick={() => void recommendApplication(ctx, application, true)} disabled={ctx.busy}>Рекомендую</button>
              <button className="btn ghost" type="button" onClick={() => void recommendApplication(ctx, application, false)} disabled={ctx.busy}>Не рекомендую</button>
            </div>
          ) : (
            <span className={`status ${application.clientRecommended ? "ok" : "warn"}`}>{application.clientRecommended ? "Рекомендуете" : "Не рекомендуете"}</span>
          )
        ) : null}
      </div>
    </div>
  );
}

function ClientOrderDetail(ctx: PaneContext) {
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);
  const order = ctx.orders.find((item) => item.id === ctx.selectedOrderId);

  if (!order) {
    return (
      <>
        <div className="page-head"><div><h2 className="page-title">Заказ не найден</h2><p className="page-copy">Возможно, он был удален или не принадлежит вашему аккаунту.</p></div></div>
        <button className="btn" type="button" onClick={() => ctx.openPane("orders")}><ArrowLeft size={16} /> К списку заказов</button>
      </>
    );
  }

  const orderApplications = ctx.applications.filter((application) => application.order?.id === order.id);
  const orderChats = ctx.chats.filter((chat) => chat.order.id === order.id);
  const aiDisabled = ["COMPLETED", "ARCHIVED", "REJECTED"].includes(order.status);

  return (
    <>
      <div className="order-back">
        <button className="btn ghost" type="button" onClick={() => ctx.openPane("orders")}><ArrowLeft size={16} /> Мои заказы</button>
      </div>
      <div className="page-head">
        <div><div className="meta">{order.publicId} · {order.category} · {orderInitiatorLabel(order.initiator)}</div><h2 className="page-title">{order.title}</h2><p className="page-copy">Все данные ниже относятся только к этому заказу.</p></div>
        <div className="inline-actions">
          <span className={`status ${order.status === "PUBLISHED" ? "ok" : "warn"}`}>{statusLabel(order.status)}</span>
          {order.status === "PAYMENT_PENDING" ? (
            <button className="btn wine" type="button" onClick={() => void payOrderPublication(ctx, order)} disabled={ctx.busy}>Оплатить публикацию</button>
          ) : null}
          {order.status === "PUBLISHED" ? (
            <button className="btn" type="button" onClick={() => void completeOrder(ctx, order)} disabled={ctx.busy} title="После этого можно будет оценить исполнителей">Отметить выполненным</button>
          ) : null}
          <button className="btn wine" type="button" onClick={() => void runAiForOrder(ctx, order)} disabled={ctx.busy || aiDisabled}><Bot size={16} /> {order.aiMatches?.length ? "Обновить AI-топ-3" : "Подобрать AI-топ-3"}</button>
        </div>
      </div>

      <div className="summary order-summary">
        <div className="metric"><span>Отклики</span><b>{orderApplications.length}</b></div>
        <div className="metric"><span>AI-рекомендации</span><b>{order.aiMatches?.length || 0}</b></div>
        <div className="metric"><span>Чаты</span><b>{orderChats.length}</b></div>
      </div>

      <div className="order-detail">
        <section className="order-info">
          <div className="job-tags"><span className="chip">{orderInitiatorLabel(order.initiator)}</span><span className="chip">{order.budget}</span><span className="chip">{order.deadline}</span></div>
          <div className="order-section"><h4>Задача</h4><p>{order.description}</p></div>
          <div className="order-section"><h4>Требования</h4><p>{order.requirements}</p></div>
          {orderChats.length ? <div className="order-section"><h4>Диалоги по заказу</h4><div className="order-chat-links">{orderChats.map((chat) => <button className="btn" type="button" key={chat.id} onClick={() => ctx.openChat(chat.id)}>{chat.creatorProfile.firstName} {chat.creatorProfile.lastName}</button>)}</div></div> : null}
        </section>
        <AiBox order={order} onProfile={setSelectedCreator} />
      </div>

      <div className="panel order-responses">
        <div className="panel-head"><span className="panel-title">Все отклики на {order.publicId}</span><span className="result-count">{orderApplications.length}</span></div>
        <div className="panel-body">
          {!orderApplications.length ? (
            <div className="empty compact">На этот заказ откликов пока нет.</div>
          ) : order.kind === "PROJECT" && order.positions?.length ? (
            // Проект — группируем отклики по позициям (сборка команды), а
            // не показываем их одной общей лентой, чтобы было видно, кто
            // на какую роль откликнулся.
            order.positions.map((position) => {
              const positionApplications = orderApplications.filter((application) => application.positionId === position.id);
              return (
                <div className="position-group" key={position.id}>
                  <div className="position-group-head">{position.title}{position.isVolunteer ? <span className="chip">волонтёр</span> : null}<span className="result-count">{positionApplications.length}</span></div>
                  {positionApplications.length ? positionApplications.map((application) => <ApplicationRow key={application.id} application={application} ctx={ctx} onProfile={setSelectedCreator} />) : <div className="empty compact">На эту позицию откликов пока нет.</div>}
                </div>
              );
            })
          ) : (
            orderApplications.map((application) => <ApplicationRow key={application.id} application={application} ctx={ctx} onProfile={setSelectedCreator} />)
          )}
        </div>
      </div>
      <CreatorProfileDialog creator={selectedCreator} canSeeContacts onClose={() => setSelectedCreator(null)} />
    </>
  );
}

function ClientResponses(ctx: PaneContext) {
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Все отклики</h2><p className="page-copy">Общая лента по компании. Для работы с конкретной заявкой перейдите в ее заказ.</p></div></div>
      <div className="panel"><div className="panel-body">
        {ctx.applications.length ? ctx.applications.map((application) => <ApplicationRow key={application.id} application={application} ctx={ctx} onProfile={setSelectedCreator} showOrderLink />) : <div className="empty">Откликов пока нет.</div>}
      </div></div>
      <CreatorProfileDialog creator={selectedCreator} canSeeContacts onClose={() => setSelectedCreator(null)} />
    </>
  );
}

function ClientCatalog(ctx: PaneContext) {
  const publishedOrders = ctx.orders.filter((order) => order.status === "PUBLISHED");
  const [selectedOrderId, setSelectedOrderId] = useState(publishedOrders[0]?.id || "");
  const canSeeContacts = !ctx.flags.paymentsRequired || Boolean(ctx.user.clientProfile?.hasDatabaseAccess);
  const invitedKeys = new Set(ctx.invitations.map((item) => `${item.order.id}:${item.creatorProfile.id}`));

  useEffect(() => {
    if (!selectedOrderId && publishedOrders[0]) setSelectedOrderId(publishedOrders[0].id);
  }, [selectedOrderId, publishedOrders]);

  async function invite(creator: CreatorProfile) {
    if (!selectedOrderId) {
      ctx.showToast("Сначала опубликуйте заказ");
      return;
    }

    ctx.setBusy(true);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderId,
          creatorProfileId: creator.id,
          message: `Ваш профиль подходит для нашего заказа. Предлагаем откликнуться и обсудить задачу внутри CREATIN.WORLD.`
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось отправить приглашение"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast(`Приглашение для ${creator.firstName} отправлено`);
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div><h2 className="page-title">Каталог креаторов</h2><p className="page-copy">{canSeeContacts ? "Контакты доступны в текущем режиме. Приглашение всегда связано с опубликованным заказом." : "Контакты скрыты. Для полного доступа нужен пакет с базой."}</p></div>
        <button className="btn" onClick={() => ctx.openPane("payments")}>Изменить пакет</button>
      </div>
      <div className="catalog-actionbar">
        <label htmlFor="invite-order">Заказ для приглашения</label>
        <SelectControl id="invite-order" value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
          {publishedOrders.length ? publishedOrders.map((order) => <option value={order.id} key={order.id}>{order.publicId} · {order.title}</option>) : <option value="">Нет опубликованных заказов</option>}
        </SelectControl>
      </div>
      <CreatorCatalog
        scope="client"
        canSeeContacts={canSeeContacts}
        renderAction={(creator) => {
          const alreadyInvited = invitedKeys.has(`${selectedOrderId}:${creator.id}`);
          return <button className="btn wine" type="button" onClick={() => invite(creator)} disabled={ctx.busy || !selectedOrderId || alreadyInvited}>{alreadyInvited ? "Приглашен" : "Пригласить"}</button>;
        }}
      />
    </>
  );
}

// Package.perks в БД может быть пустым (например, если кто-то создаст
// пакет вручную без списка плюсов) — тогда собираем разумный дефолт из
// placements/databaseAccess, чтобы карточка тарифа никогда не осталась
// без списка преимуществ.
function packagePerks(item: PackagePlan): string[] {
  if (item.perks?.length) return item.perks;
  const perks = [
    item.placements === 1 ? "Публикация одной вакансии в ленте" : `Публикация ${item.placements || 1} вакансий в ленте`,
    "AI-топ-3 подходящих креаторов",
    "Открытые контакты откликнувшихся",
    "Чат по каждому заказу"
  ];
  if (item.databaseAccess) perks.push("Доступ к контактам всей базы креаторов");
  return perks;
}

function PaymentPane(ctx: PaneContext & { packages: PackagePlan[] }) {
  const [selectedPackage, setSelectedPackage] = useState(ctx.packages[0]?.id || "");
  const activePackageId = ctx.user.clientProfile?.activePackageId;

  async function pay() {
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/payments/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "client_package", packageId: selectedPackage })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось активировать пакет"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast(ctx.flags.paymentsRequired ? "Тестовый платеж создан" : "Тестовый пакет активирован");
      ctx.openPane("catalog");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Оплата и пакеты</h2><p className="page-copy">{ctx.flags.paymentsRequired ? "Выберите подходящий пакет. Доступ откроется после подтверждения оплаты." : "На текущем этапе пакет активируется сразу после выбора."}</p></div></div>
      <div className="package-grid">{ctx.packages.map((item) => {
        const isSelected = selectedPackage === item.id;
        const isActive = activePackageId === item.id;
        const recommended = (item.placements || 0) > 1;
        return (
          <button className={`package ${isSelected ? "selected" : ""}`} key={item.id} type="button" onClick={() => setSelectedPackage(item.id)}>
            {recommended ? <span className="package-badge">Выгоднее</span> : null}
            <div className="meta">{item.placements === 1 ? "1 вакансия" : `${item.placements || 1} вакансии`}</div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <div className="price">{formatMoney(item.priceCents)}</div>
            <ul className="perks">
              {packagePerks(item).map((perk) => (
                <li key={perk}><Check size={14} /><span>{perk}</span></li>
              ))}
            </ul>
            {isActive ? <span className="status ok">Текущий пакет</span> : null}
          </button>
        );
      })}</div>
      <div className="panel" style={{ marginTop: 14 }}><div className="panel-body"><button className="btn wine" onClick={pay} disabled={ctx.busy || !selectedPackage}>{ctx.flags.paymentsRequired ? "Перейти к оплате" : "Активировать пакет"}</button></div></div>
    </>
  );
}

function ChatPane(ctx: PaneContext) {
  const activeChat = ctx.chats.find((chat) => chat.id === ctx.activeChatId) || ctx.chats[0];
  const [body, setBody] = useState("");
  const counterpart = activeChat
    ? ctx.user.role === "CREATOR"
      ? activeChat.clientProfile.companyName
      : `${activeChat.creatorProfile.firstName} ${activeChat.creatorProfile.lastName}`
    : "";

  useEffect(() => {
    setBody("");
  }, [activeChat?.id]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!activeChat || !body.trim()) return;
    ctx.setBusy(true);
    try {
      const response = await fetch(`/api/chats/${activeChat.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось отправить сообщение"));
        return;
      }
      setBody("");
      await ctx.refreshAll();
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Чаты по заказам</h2><p className="page-copy">Свободных личных сообщений нет. Каждый чат связан с конкретным заказом и откликом.</p></div></div>
      {activeChat ? (
        <div className="chat">
          <div className="chat-list">
            {ctx.chats.map((chat) => {
              const lastMessage = chat.messages.at(-1);
              const chatName = ctx.user.role === "CREATOR"
                ? chat.clientProfile.companyName
                : `${chat.creatorProfile.firstName} ${chat.creatorProfile.lastName}`;
              return (
                <button className={`chat-person ${chat.id === activeChat.id ? "active" : ""}`} type="button" key={chat.id} onClick={() => ctx.openChat(chat.id)}>
                  <span className="chat-person-top"><b>{chatName}</b><time>{lastMessage ? new Date(lastMessage.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : ""}</time></span>
                  <small>{chat.order.publicId} · {chat.order.title}</small>
                  <span className="chat-preview">{lastMessage ? `${lastMessage.senderId === ctx.user.id ? "Вы: " : ""}${lastMessage.body}` : "Сообщений пока нет"}</span>
                </button>
              );
            })}
          </div>
          <div className="chat-window">
            <div className="chat-order">
              <div><b>{counterpart}</b><span>{activeChat.order.publicId} · {activeChat.order.title}</span></div>
              <div className="chat-order-meta"><span className="status ok">{statusLabel(activeChat.application.status)}</span>{activeChat.application.priceCents ? <span className="chip">{formatMoney(activeChat.application.priceCents)}</span> : null}</div>
            </div>
            <div className="messages">
              {activeChat.messages.length ? activeChat.messages.map((message) => <div className={`bubble ${message.senderId === ctx.user.id ? "me" : ""}`} key={message.id}><small>{message.senderId === ctx.user.id ? "Вы" : message.sender.name} · {new Date(message.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small><span>{message.body}</span></div>) : <div className="chat-empty">Начните обсуждение этого отклика и заказа.</div>}
            </div>
            <form className="composer" onSubmit={send}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder="Сообщение по заказу" aria-label="Сообщение по заказу" /><button className="btn wine" disabled={ctx.busy || !body.trim()}>Отправить</button></form>
          </div>
        </div>
      ) : (
        <div className="empty">Чаты появятся после отклика креатора и открытия коммуникации заказчиком.</div>
      )}
    </>
  );
}

function SettingsPane(ctx: PaneContext) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ctx.setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email")),
          notificationPreference: String(form.get("notificationPreference"))
        })
      });
      if (!response.ok) {
        ctx.showToast(await responseError(response, "Не удалось сохранить настройки"));
        return;
      }
      await ctx.refreshAll();
      ctx.showToast("Настройки сохранены");
    } finally {
      ctx.setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head"><div><h2 className="page-title">Настройки</h2><p className="page-copy">Telegram, уведомления и безопасность аккаунта.</p></div></div>
      <form className="panel" onSubmit={submit}><div className="panel-body">
        <div className="form-row"><label>Telegram</label><input value={`@${ctx.user.telegramUsername || "telegram"}`} disabled /></div>
        <div className="form-row"><label>Email для документов и уведомлений</label><input name="email" type="email" defaultValue={ctx.user.email || ""} placeholder="name@example.com" /></div>
        <div className="form-row"><label>Уведомления</label><SelectControl name="notificationPreference" defaultValue={ctx.user.notificationPreference || "telegram"}><option value="telegram">Telegram + внутри платформы</option><option value="platform">Только внутри платформы</option></SelectControl></div>
        <div className="form-row"><label>Тема интерфейса</label><ThemeControl /></div>
        <button className="btn wine" disabled={ctx.busy} style={{ marginTop: 12 }}>{ctx.busy ? "Сохраняем..." : "Сохранить"}</button>
      </div></form>
    </>
  );
}
