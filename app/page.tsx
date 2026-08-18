import Link from "next/link";
import { ArrowUpRight, CheckCircle2, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { FeaturedCreators } from "@/components/brand/FeaturedCreators";
import { HomeStats } from "@/components/brand/HomeStats";

const HERO_COLLAGE = [
  "creatin-hero-1",
  "creatin-hero-2",
  "creatin-hero-3",
  "creatin-hero-4",
  "creatin-hero-5",
  "creatin-hero-6"
];

// Плитки категорий на главной — текстовые карточки (номер + название +
// короткая расшифровка), без фото. Одна карточка выделяется сплошным
// wine-фоном (accent: true) — просто визуальный акцент ряда, ротировать
// её по данным смысла не имеет.
const CATEGORIES = [
  { num: "01", label: "Дизайн", desc: "Айдентика, web, графика" },
  { num: "02", label: "Видео", desc: "Съёмка, режиссура, motion" },
  { num: "03", label: "Тексты", desc: "Редактура, сценарии, tone of voice" },
  { num: "04", label: "Маркетинг", desc: "Стратегия, SMM, performance", accent: true },
  { num: "05", label: "Креатив", desc: "Концепции, кампании, продюсирование" },
  { num: "06", label: "AI", desc: "Визуалы, видео, автоматизация" },
  { num: "07", label: "Менеджмент", desc: "Проекты, команды, процессы" }
];

const HOW_IT_WORKS = [
  {
    num: "01",
    title: "Регистрация",
    text: "Короткая анкета для креатора или заказчика, подтверждение личности через Telegram."
  },
  {
    num: "02",
    title: "Проверка",
    text: "Администратор вручную одобряет анкету — в каталоге только реальные профили и заказы."
  },
  {
    num: "03",
    title: "Подбор",
    text: "Заказчик публикует бриф, AI формирует топ-3 исполнителей, креатор откликается на вакансии."
  },
  {
    num: "04",
    title: "Работа",
    text: "Обсуждение, контакты и статус заказа — в одном чате внутри платформы, без утечки контактов."
  }
];

const CREATOR_POINTS = [
  "Открытый каталог вакансий с фильтрами по категориям и формату работы",
  "Отклики и приглашения от заказчиков после модерации анкеты",
  "Личный профиль с портфолио, кейсами и уровнем экспертизы",
  "Чат и статус заказа — в одном месте, без переписки в личке"
];

const CLIENT_POINTS = [
  "Публикация заказа за несколько минут и открытый каталог креаторов",
  "AI-топ-3 исполнителя под бриф с обоснованием подбора",
  "Проверенные анкеты — каждая проходит модерацию перед показом",
  "Прямой чат с исполнителем внутри карточки заказа"
];

const GUARANTEES = [
  {
    num: "01",
    title: "Ручная модерация",
    text: "Каждая анкета и каждый заказ проходят проверку администратора до публикации в каталоге."
  },
  {
    num: "02",
    title: "Только оплатившие подписку",
    text: "Контакт креатора открыт в каталоге, только если анкета одобрена и подписка оплачена — случайных профилей нет."
  },
  {
    num: "03",
    title: "Прозрачная история",
    text: "Статусы заказов, отклики и переписка сохраняются в одном месте, а не в десятке чатов."
  }
];

// Декоративные стоковые фото для атмосферы (коллаж в хиро, карточки
// категорий/аудиторий и т.д.) — не настоящие фотографии платформы. Каждый
// seed детерминирован, так что одна и та же картинка не "прыгает" между
// перезагрузками. В CSS такие фото всегда идут с ч/б фильтром, который
// снимается на hover (см. .photo-tile в globals.css) — это осознанный
// визуальный приём, а не забытый debug-стиль.
function picsum(seed: string, width: number, height: number) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Профессиональная платформа креативного рынка</div>
          <h1>
            Работай с <span>сильнейшими.</span>
          </h1>
          <p className="hero-lead">
            Проверенные специалисты, качественные заказы, закрытое сообщество и AI-подбор
            исполнителей для каждого проекта в одной экосистеме.
          </p>
          <div className="hero-actions">
            <Link className="btn wine" href="/login?role=creator">
              Стать креатором
            </Link>
            <Link className="btn" href="/login?role=client">
              Разместить заказ
            </Link>
          </div>
          <div className="trust-strip">
            <div className="trust-item">
              <ShieldCheck size={16} />
              Ручная модерация анкет и заказов
            </div>
            <div className="trust-item">
              <Sparkles size={16} />
              AI подбирает топ-3 исполнителя
            </div>
            <div className="trust-item">
              <MessageSquare size={16} />
              Общение и сделка — внутри заказа
            </div>
          </div>
          <div className="hero-collage">
            {HERO_COLLAGE.map((seed) => (
              <div className="photo-tile" key={seed}>
                <img src={picsum(seed, 480, 640)} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
        <div className="hero-bottom">
          <HomeStats />
          <div className="hero-note">
            От публикации брифа до выбора исполнителя и рабочего диалога внутри заказа.
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Каталог</div>
            <h2>Специализации на платформе</h2>
          </div>
          <p className="section-copy">
            От брендинга до AI-продакшна — выберите категорию и сразу переходите к
            подходящим креаторам.
          </p>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((item) => (
            <Link
              className={`category-card ${item.accent ? "accent" : ""}`}
              href={`/creators?category=${encodeURIComponent(item.label)}`}
              key={item.label}
            >
              <div className="category-card-top">
                <span className="num">{item.num}</span>
                <ArrowUpRight className="category-card-arrow" size={18} />
              </div>
              <div>
                <b>{item.label}</b>
                <span>{item.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-head">
          <div>
            <div className="eyebrow">Рейтинг каталога</div>
            <h2>Топ креаторов недели</h2>
          </div>
          <p className="section-copy">
            Сортировка по внутреннему рейтингу платформы: опыт, портфолио и качество отклика.
          </p>
        </div>
        <FeaturedCreators />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">Процесс</div>
            <h2>От заявки до результата — четыре шага</h2>
          </div>
          <p className="section-copy">
            Один и тот же понятный путь для креатора и заказчика: регистрация, проверка,
            подбор и работа внутри платформы.
          </p>
        </div>
        <div className="timeline">
          {HOW_IT_WORKS.map((step) => (
            <div className="timeline-step" key={step.num}>
              <span className="timeline-num">{step.num}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-head">
          <div>
            <div className="eyebrow">Два кабинета, один процесс</div>
            <h2>Выберите свою роль</h2>
          </div>
          <p className="section-copy">
            Интерфейс автоматически перестраивается под роль. Креатор не видит создание
            заказов и оплату размещений. Заказчик не видит отклик на вакансии и
            профессиональную анкету креатора.
          </p>
        </div>
        <div className="audience-grid">
          <article className="audience-card">
            <span className="role-pill">Я креатор</span>
            <h3>Работайте с заказчиками, которые уже отобраны</h3>
            <p>Анкета, вступление, вакансии, отклики, приглашения и чаты по заказам.</p>
            <ul className="checklist">
              {CREATOR_POINTS.map((point) => (
                <li key={point}>
                  <CheckCircle2 size={16} />
                  {point}
                </li>
              ))}
            </ul>
            <Link className="btn wine" href="/login?role=creator">
              Стать креатором
            </Link>
          </article>
          <article className="audience-card accent">
            <span className="role-pill">Я заказчик</span>
            <h3>Находите исполнителей быстрее, чем вручную</h3>
            <p>Компания, пакеты размещения, заказы, AI-топ-3, отклики и контакты.</p>
            <ul className="checklist">
              {CLIENT_POINTS.map((point) => (
                <li key={point}>
                  <CheckCircle2 size={16} />
                  {point}
                </li>
              ))}
            </ul>
            <Link className="btn wine" href="/login?role=client">
              Разместить заказ
            </Link>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <div className="eyebrow">AI-подбор</div>
            <h2>Топ-3 исполнителя под каждый бриф</h2>
          </div>
          <p className="section-copy">
            Экономит часы ручного поиска и не заменяет решение заказчика — финальный выбор
            всегда остаётся за ним.
          </p>
        </div>
        <div className="feature-band">
          <div>
            <div className="eyebrow">Как это работает</div>
            <h3>Как только заказ опубликован, платформа анализирует бриф</h3>
            <p>
              Категория, бюджет, формат работы и портфолио сопоставляются с анкетами каталога.
              Заказчик получает трёх наиболее подходящих исполнителей с кратким обоснованием
              подбора и может пригласить любого из них в заказ.
            </p>
          </div>
          <div className="feature-visual">
            <div className="feature-row">
              <span className="feature-rank">1</span>
              <div>
                <b>Кандидат 1 · Motion designer</b>
                <span>Совпадение по категории, бюджету и портфолио</span>
              </div>
            </div>
            <div className="feature-row">
              <span className="feature-rank">2</span>
              <div>
                <b>Кандидат 2 · Motion designer</b>
                <span>Опыт в похожих проектах</span>
              </div>
            </div>
            <div className="feature-row">
              <span className="feature-rank">3</span>
              <div>
                <b>Кандидат 3 · Motion designer</b>
                <span>Доступен в нужном формате работы</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-head">
          <div>
            <div className="eyebrow">Почему это безопасно</div>
            <h2>Порядок вместо хаоса фриланс-чатов</h2>
          </div>
          <p className="section-copy">
            Модерация, закрытые контакты и единая история заказа — платформа берёт на себя
            рутину, которая обычно решается десятком мессенджеров.
          </p>
        </div>
        <div className="topic-grid">
          {GUARANTEES.map((item) => (
            <article className="topic" key={item.num}>
              <span className="num">{item.num}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="cta-band"
        style={{
          backgroundImage: `linear-gradient(120deg, rgba(120,25,47,.9), rgba(162,42,73,.82)), url(${picsum("creatin-cta", 1600, 500)})`
        }}
      >
        <div>
          <div className="eyebrow">Готовы начать?</div>
          <h2>Подключайтесь через Telegram уже сегодня</h2>
          <p>Заполните короткую анкету — доступ к кабинету откроется после проверки администратором.</p>
        </div>
        <div className="hero-actions">
          <Link className="btn wine" href="/login?role=creator">
            Стать креатором
          </Link>
          <Link className="btn" href="/login?role=client">
            Разместить заказ
          </Link>
        </div>
      </section>
    </>
  );
}
