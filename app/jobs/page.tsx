import { PublicJobs } from "@/components/platform/PublicJobs";

export default function JobsPage() {
  return (
    <section className="section fill">
      <div className="section-head">
        <div>
          <div className="eyebrow">Открытые проекты</div>
          <h2>Вакансии и заказы</h2>
        </div>
        <p className="section-copy">
          Публичный просмотр без отклика. Отклик становится доступен креатору внутри платформы.
        </p>
      </div>
      <PublicJobs />
    </section>
  );
}
