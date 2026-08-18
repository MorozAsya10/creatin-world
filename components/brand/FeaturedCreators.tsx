"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { CreatorProfile } from "@/lib/types";

// "Топ креаторов недели" на главной — по факту просто первые 8 из публичного
// каталога, отсортированного по score/опыту на бэкенде (см. orderBy в
// app/api/creators/route.ts); отдельного понятия "неделя" в данных нет.
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
    <div className="rank-strip">
      {loading
        ? Array.from({ length: 6 }).map((_, index) => (
            <div className="rank-card" key={index}>
              <div className="rank-card-avatar">
                <div className="avatar avatar-xl" />
              </div>
            </div>
          ))
        : creators.map((creator, index) => (
            <Link className="rank-card" href="/creators" key={creator.id}>
              <div className="rank-card-avatar">
                <Avatar
                  name={`${creator.firstName} ${creator.lastName}`}
                  photoUrl={creator.photoUrl}
                  className="avatar-xl"
                />
                <span className="rank-badge">{index + 1}</span>
              </div>
              <b>
                {creator.firstName} {creator.lastName}
              </b>
              <span>{creator.primaryRole}</span>
            </Link>
          ))}
    </div>
  );
}
