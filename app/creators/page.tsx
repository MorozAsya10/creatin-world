import { Suspense } from "react";
import { CreatorCatalog } from "@/components/catalog/CreatorCatalog";

export default function CreatorsPage() {
  return (
    <section className="section fill">
      <div className="section-head">
        <div>
          <div className="eyebrow">Открытый каталог</div>
          <h2>Проверенные креаторы</h2>
        </div>
        <p className="section-copy">
          Здесь только одобренные модерацией креаторы с оплаченной подпиской — профиль, портфолио и контакт открыты сразу.
        </p>
      </div>
      <Suspense fallback={<div className="loading">Загружаем каталог...</div>}>
        <CreatorCatalog scope="public" canSeeContacts />
      </Suspense>
    </section>
  );
}
