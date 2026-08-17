import { prisma } from "@/lib/prisma";

// Публичная страница читает Partner напрямую через Prisma (серверный
// компонент, без похода через /api/partners) — тот же список, что отдаёт
// GET /api/partners, используется, например, для клиентских виджетов.
export default async function PartnersPage() {
  const partners = await prisma.partner.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }]
  });

  return (
    <section className="section fill">
      <div className="section-head">
        <div>
          <div className="eyebrow">Партнёрские предложения</div>
          <h2>Партнёры</h2>
        </div>
        <p className="section-copy">
          Курсы, сервисы и продукты для креативной индустрии — от компаний, с которыми
          сотрудничает платформа. Заявки на партнёрство принимаем вручную, публикуем сами.
        </p>
      </div>
      {partners.length ? (
        <div className="partner-grid">
          {partners.map((partner) => (
            <article className="partner-card" key={partner.id}>
              {partner.imageUrl ? (
                <div className="partner-media">
                  <img src={partner.imageUrl} alt="" loading="lazy" />
                </div>
              ) : null}
              <div className="partner-body">
                <div className="partner-sponsor">{partner.sponsorName}</div>
                <h3>{partner.title}</h3>
                <p>{partner.description}</p>
                <a className="btn wine" href={partner.linkUrl} target="_blank" rel="noreferrer noopener">
                  Подробнее
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">Партнёрских предложений пока нет.</div>
      )}
    </section>
  );
}
