"use client";

import { useEffect, useState } from "react";

type Stats = {
  creators: number;
  publishedOrders: number;
};

export function HomeStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((data: { stats?: Stats }) => setStats(data.stats || null))
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="hero-stats">
      <div className="hero-stat">
        <b>{stats?.creators ?? "—"}</b>
        <small>креаторов в открытом каталоге</small>
      </div>
      <div className="hero-stat">
        <b>{stats?.publishedOrders ?? "—"}</b>
        <small>опубликованных заказов сейчас</small>
      </div>
      <div className="hero-stat">
        <b>Топ-3</b>
        <small>AI-рекомендации под каждый заказ</small>
      </div>
    </div>
  );
}
