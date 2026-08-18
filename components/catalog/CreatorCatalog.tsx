"use client";

import { RotateCcw, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CreatorProfileDialog } from "@/components/catalog/CreatorProfileDialog";
import { Avatar } from "@/components/ui/Avatar";
import { SelectControl } from "@/components/ui/SelectControl";
import type { CreatorProfile } from "@/lib/types";

const categories = ["Все", "Дизайн", "Видео", "Тексты", "Маркетинг", "Креатив", "AI", "Менеджмент"];

function categoryLabel(category: string) {
  if (category === "Видео") return "Видео и продакшн";
  if (category === "Креатив") return "Креатив и стратегия";
  if (category === "AI") return "AI и digital";
  return category;
}

function budgetLabel(value: number) {
  return `от ${Math.round(value / 1000)} тыс. ₽`;
}

// Один компонент для двух мест: публичный /creators (scope="public") и
// каталог заказчика в кабинете (scope="client", + renderAction рендерит
// кнопку "Пригласить"). Видимость контактов —
// пересечение canSeeContacts (что разрешает конкретная страница) и
// serverAllowsContacts (что реально вернул API на основе прав пользователя,
// см. GET /api/creators) — фронт не может "выпросить" контакты сам по себе.
type Props = {
  scope?: "public" | "client";
  canSeeContacts?: boolean;
  renderAction?: (creator: CreatorProfile) => ReactNode;
};

export function CreatorCatalog({ scope = "public", canSeeContacts = false, renderAction }: Props) {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "Все";
  const [category, setCategory] = useState(categories.includes(initialCategory) ? initialCategory : "Все");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [format, setFormat] = useState("");
  const [budget, setBudget] = useState("");
  const [availability, setAvailability] = useState("");
  const [sort, setSort] = useState("match");
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serverAllowsContacts, setServerAllowsContacts] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    params.set("category", category);
    if (search) params.set("search", search);
    if (level) params.set("level", level);
    if (format) params.set("format", format);
    if (budget) params.set("budget", budget);
    if (availability) params.set("availability", availability);
    return params.toString();
  }, [scope, category, search, level, format, budget, availability]);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/creators?${query}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          creators?: CreatorProfile[];
          canSeeContacts?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить каталог");
        setCreators(data.creators || []);
        setServerAllowsContacts(Boolean(data.canSeeContacts));
      })
      .catch((reason: unknown) => {
        setCreators([]);
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог");
      })
      .finally(() => setLoading(false));
  }, [query]);

  const sortedCreators = useMemo(() => {
    return [...creators].sort((a, b) => {
      if (sort === "experience") return b.experienceYears - a.experienceYears;
      if (sort === "price") return a.minBudget - b.minBudget;
      return b.score - a.score;
    });
  }, [creators, sort]);

  function reset() {
    setCategory("Все");
    setSearch("");
    setLevel("");
    setFormat("");
    setBudget("");
    setAvailability("");
    setSort("match");
  }

  const contactsVisible = canSeeContacts && serverAllowsContacts;

  return (
    <>
      <div className="catalog-shell">
        <div className="category-row">
          {categories.map((item) => (
            <button
              key={`${scope}-${item}`}
              className={`catbtn ${category === item ? "active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {categoryLabel(item)}
            </button>
          ))}
        </div>
        <div className="filters">
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", top: 13, left: 12, color: "#777" }} />
            <input
              className="search"
              style={{ paddingLeft: 36 }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени, роли или экспертизе"
            />
          </div>
          <SelectControl value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">Любой уровень</option>
            <option>Junior</option>
            <option>Middle</option>
            <option>Senior</option>
          </SelectControl>
          <SelectControl value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="">Любой формат</option>
            <option>Проект</option>
            <option>Part-time</option>
          </SelectControl>
          <SelectControl value={budget} onChange={(event) => setBudget(event.target.value)}>
            <option value="">Любой бюджет</option>
            <option value="low">до 100 000 ₽</option>
            <option value="mid">100-200 тыс. ₽</option>
            <option value="high">от 200 000 ₽</option>
          </SelectControl>
          <SelectControl value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="">Любая доступность</option>
            <option value="available">Свободен сейчас</option>
            <option value="soon">Свободен скоро</option>
          </SelectControl>
          <button className="btn" onClick={reset} title="Сбросить фильтры">
            <RotateCcw size={16} /> Сбросить
          </button>
        </div>
      </div>
      <div className="creators-toolbar">
        <div className="result-count">{loading ? "Загрузка..." : `Найдено: ${sortedCreators.length}`}</div>
        <SelectControl
          containerClassName="select-compact"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="match">По релевантности</option>
          <option value="experience">По опыту</option>
          <option value="price">По бюджету</option>
        </SelectControl>
      </div>
      <div className="grid three">
        {sortedCreators.length ? (
          sortedCreators.map((creator) => (
            <article className="profile-card" key={creator.id}>
              <div className="profile-top">
                <Avatar name={`${creator.firstName} ${creator.lastName}`} photoUrl={creator.photoUrl} />
                <div>
                  <h3>
                    {creator.firstName} {creator.lastName}
                  </h3>
                  <div className="meta">{creator.primaryRole}</div>
                </div>
                {/* Единый индекс креатора (0-100%) — составной: заполненность
                    профиля + активность на платформе + доля заказчиков,
                    готовых рекомендовать (см. lib/rating.ts). Отдельного
                    счётчика "рекомендуют N из M" больше нет — он входил бы в
                    этот же индекс, а не показывался бы рядом. */}
                <span className="score" title="Индекс: заполненность анкеты + активность + рекомендации заказчиков">{creator.score}%</span>
              </div>
              <p>{creator.bio}</p>
              <div>
                {creator.expertise.map((tag) => (
                  <span className="tag" key={`${creator.id}-${tag}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="meta" style={{ marginTop: 12 }}>
                {creator.level} · {creator.workFormat} · {budgetLabel(creator.minBudget)}
              </div>
              {contactsVisible ? (
                <div style={{ marginTop: 12 }}>
                  <b>{creator.telegramContact || (creator.user?.telegramUsername ? `@${creator.user.telegramUsername}` : "Контакт не указан")}</b>
                </div>
              ) : (
                <div className="contact-mask">{scope === "public" ? "Загружаем контакт..." : "Контакт скрыт выбранным пакетом"}</div>
              )}
              <div className="profile-actions">
                <button className="btn" type="button" onClick={() => setSelectedCreator(creator)}>
                  Смотреть профиль
                </button>
                {renderAction?.(creator)}
              </div>
            </article>
          ))
        ) : (
          <div className="empty">{loading ? "Загружаем каталог..." : error || "Ничего не найдено."}</div>
        )}
      </div>
      <CreatorProfileDialog
        creator={selectedCreator}
        canSeeContacts={contactsVisible}
        onClose={() => setSelectedCreator(null)}
      />
    </>
  );
}
