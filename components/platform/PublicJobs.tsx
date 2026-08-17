"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { orderInitiatorLabel } from "@/lib/presentation";
import type { ApiUser, FeatureFlags, Order } from "@/lib/types";

// Гостевой просмотр вакансий на /jobs — без отклика (кнопка ведёт в
// кабинет/логин, сам отклик доступен только внутри кабинета креатора).
// Три параллельных запроса вместо /api/bootstrap: странице не нужны пакеты
// и счётчики, только заказы + сессия (для текста кнопки) + флаг оплаты
// (чтобы показать бейдж "Оплаченное размещение").
export function PublicJobs() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/orders?scope=public"),
      fetch("/api/auth/session"),
      fetch("/api/feature-flags")
    ])
      .then(async ([ordersResponse, sessionResponse, flagsResponse]) => {
        if (!ordersResponse.ok) throw new Error("Не удалось загрузить заказы");
        const ordersData = (await ordersResponse.json()) as { orders: Order[] };
        const sessionData = sessionResponse.ok
          ? (await sessionResponse.json()) as { user: ApiUser | null }
          : { user: null };
        const flagsData = flagsResponse.ok
          ? (await flagsResponse.json()) as { flags: FeatureFlags }
          : null;
        setOrders(ordersData.orders || []);
        setUser(sessionData.user);
        setFlags(flagsData?.flags || null);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel">
      <div className="panel-body">
        {loading ? (
          <div className="loading">Загружаем заказы...</div>
        ) : orders.length ? (
          orders.map((order) => (
            <div className="job" key={order.id}>
              <div className="meta">
                {order.publicId} · {order.category}
              </div>
              <h3>{order.title}</h3>
              <p>{order.description}</p>
              <div className="job-tags">
                <span className="chip">{orderInitiatorLabel(order.initiator)}</span>
                <span className="chip">{order.budget}</span>
                <span className="chip">{order.deadline}</span>
                {flags?.paymentsRequired ? <span className="status ok">Оплаченное размещение</span> : null}
              </div>
              <Link
                className="btn"
                style={{ marginTop: 12 }}
                href={user?.role === "CREATOR" ? "/platform?pane=jobs" : user ? "/platform" : "/login?role=creator"}
              >
                {user?.role === "CREATOR" ? "Откликнуться в кабинете" : user ? "Открыть кабинет" : "Войти, чтобы откликнуться"}
              </Link>
            </div>
          ))
        ) : (
          <div className="empty">{error || "Публичных заказов пока нет."}</div>
        )}
      </div>
    </div>
  );
}
