"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { CreatorProfile } from "@/lib/types";

// "Топ креаторов недели" на главной — по факту просто первые 8 из публичного
// каталога, отсортированного по score/опыту на бэкенде (см. orderBy в
// app/api/creators/route.ts); отдельного понятия "неделя" в данных нет.
// Список в две колонки с индексом и score% — вместо горизонтальной ленты
// аватаров, см. референс-макет.
export function FeaturedCreators() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/creators?scope=public&category=Все")
      .then(async (response) => {
        const data = (await response.json()) as { creators?: CreatorProfile[] };
        setCreators((data.creators || []).slice(0, 8));
      })
      .catch(() => setCreators([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && !creators.length) return null;

  return (
    <div>
      <div className="rank-list-head">
        <Link className="link-arrow" href="/creators">
          Весь каталог
          <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="rank-list">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div className="rank-row" key={index}>
                <span className="rank-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="avatar" />
                <div className="rank-row-info">
                  <b>&nbsp;</b>
                </div>
              </div>
            ))
          : creators.map((creator, index) => (
              <Link className="rank-row" href="/creators" key={creator.id}>
                <span className="rank-index">{String(index + 1).padStart(2, "0")}</span>
                <Avatar
                  name={`${creator.firstName} ${creator.lastName}`}
                  photoUrl={creator.photoUrl}
                />
                <div className="rank-row-info">
                  <b>
                    {creator.firstName} {creator.lastName}
                  </b>
                  <span>{creator.primaryRole}</span>
                </div>
                <span className="rank-score">{creator.score}%</span>
              </Link>
            ))}
      </div>
    </div>
  );
}
