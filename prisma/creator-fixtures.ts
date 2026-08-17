// Генератор ~100 правдоподобных демо-профилей креаторов (roleTemplates ниже
// комбинируются с именами/городами), чтобы каталог/лента не выглядели пустыми
// на демо-стенде. Используется из prisma/seed.ts (полный ресид) и из
// lib/demo-creators.ts::upsertGeneratedCreators (точечный upsert, без
// удаления остальных данных — вызывается из админки).
export type CreatorSeed = {
  telegramId: string;
  telegramUsername: string;
  firstName: string;
  lastName: string;
  city: string;
  category: string;
  primaryRole: string;
  level: string;
  experienceYears: number;
  expertise: string[];
  bio: string;
  minBudget: number;
  hourlyRate: number;
  workFormat: string;
  availability: string;
  score: number;
  portfolioUrl?: string;
  cases?: string;
  photoUrl?: string;
};

// Заглушки-аватарки для демо-анкет (иллюстрированные лица без привязки к реальным людям).
export function dicebearAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
}

type RoleTemplate = {
  category: string;
  primaryRole: string;
  expertise: [string, string, string];
  focus: string;
  baseBudget: number;
};

const roleTemplates: RoleTemplate[] = [
  {
    category: "Дизайн",
    primaryRole: "Brand designer",
    expertise: ["Айдентика", "Типографика", "Гайдлайны"],
    focus: "Создает айдентику и визуальные системы для новых брендов.",
    baseBudget: 120000
  },
  {
    category: "Дизайн",
    primaryRole: "UX/UI designer",
    expertise: ["UX", "UI", "Figma"],
    focus: "Проектирует понятные интерфейсы и масштабируемые дизайн-системы.",
    baseBudget: 130000
  },
  {
    category: "Дизайн",
    primaryRole: "Graphic designer",
    expertise: ["Key visual", "Packaging", "Editorial"],
    focus: "Разрабатывает графику, упаковку и коммуникационные материалы.",
    baseBudget: 90000
  },
  {
    category: "Дизайн",
    primaryRole: "Web designer",
    expertise: ["Web", "Лендинги", "No-code"],
    focus: "Собирает выразительные сайты для продуктов, событий и сервисов.",
    baseBudget: 100000
  },
  {
    category: "Видео",
    primaryRole: "Video editor",
    expertise: ["Монтаж", "Reels", "Вертикальное видео"],
    focus: "Монтирует динамичные ролики для социальных сетей и бренд-медиа.",
    baseBudget: 80000
  },
  {
    category: "Видео",
    primaryRole: "Director",
    expertise: ["Режиссура", "Реклама", "Storytelling"],
    focus: "Ведет рекламные и имиджевые съемки от treatment до финального кадра.",
    baseBudget: 220000
  },
  {
    category: "Видео",
    primaryRole: "Director of photography",
    expertise: ["Камера", "Свет", "Fashion"],
    focus: "Снимает fashion, рекламные и музыкальные проекты.",
    baseBudget: 180000
  },
  {
    category: "Видео",
    primaryRole: "Motion designer",
    expertise: ["Motion", "After Effects", "2D"],
    focus: "Создает моушн-графику, заставки и продуктовые ролики.",
    baseBudget: 120000
  },
  {
    category: "Тексты",
    primaryRole: "Copywriter",
    expertise: ["Tone of voice", "SMM", "Лендинги"],
    focus: "Пишет тексты для брендов, кампаний и digital-продуктов.",
    baseBudget: 60000
  },
  {
    category: "Тексты",
    primaryRole: "Editor",
    expertise: ["Редактура", "Медиа", "Лонгриды"],
    focus: "Выстраивает редакционные процессы и выпускает сложные материалы.",
    baseBudget: 85000
  },
  {
    category: "Тексты",
    primaryRole: "Scriptwriter",
    expertise: ["Сценарии", "YouTube", "Shorts"],
    focus: "Разрабатывает сценарии для рекламных, экспертных и развлекательных видео.",
    baseBudget: 70000
  },
  {
    category: "Тексты",
    primaryRole: "UX writer",
    expertise: ["UX writing", "Продукт", "Онбординг"],
    focus: "Проектирует интерфейсные тексты и голос цифровых продуктов.",
    baseBudget: 100000
  },
  {
    category: "Маркетинг",
    primaryRole: "Brand strategist",
    expertise: ["Стратегия", "Research", "Позиционирование"],
    focus: "Исследует рынок и формирует платформы брендов.",
    baseBudget: 150000
  },
  {
    category: "Маркетинг",
    primaryRole: "Content strategist",
    expertise: ["Контент", "Редплан", "Аналитика"],
    focus: "Строит контент-системы для роста охватов и доверия.",
    baseBudget: 110000
  },
  {
    category: "Маркетинг",
    primaryRole: "SMM lead",
    expertise: ["SMM", "Комьюнити", "Influence"],
    focus: "Запускает социальные каналы и управляет контент-командами.",
    baseBudget: 100000
  },
  {
    category: "Маркетинг",
    primaryRole: "Performance marketer",
    expertise: ["Performance", "Воронки", "A/B тесты"],
    focus: "Настраивает измеримый digital-маркетинг и продуктовые воронки.",
    baseBudget: 130000
  },
  {
    category: "Креатив",
    primaryRole: "Creative director",
    expertise: ["Креатив", "Кампании", "Команды"],
    focus: "Разрабатывает большие идеи и ведет команды до реализации.",
    baseBudget: 250000
  },
  {
    category: "Креатив",
    primaryRole: "Art director",
    expertise: ["Арт-дирекшн", "Айдентика", "Fashion"],
    focus: "Создает визуальный язык кампаний и культурных проектов.",
    baseBudget: 200000
  },
  {
    category: "Креатив",
    primaryRole: "Concept creator",
    expertise: ["Концепции", "Спецпроекты", "Digital"],
    focus: "Придумывает механики и концепции для бренд-активаций.",
    baseBudget: 140000
  },
  {
    category: "Креатив",
    primaryRole: "Event creative",
    expertise: ["События", "Сценография", "Experience"],
    focus: "Проектирует креативную часть событий и пространственных форматов.",
    baseBudget: 160000
  },
  {
    category: "AI",
    primaryRole: "AI video creator",
    expertise: ["AI video", "Runway", "Kling"],
    focus: "Создает генеративные ролики и гибридный AI-production.",
    baseBudget: 110000
  },
  {
    category: "AI",
    primaryRole: "AI artist",
    expertise: ["Midjourney", "ComfyUI", "Campaigns"],
    focus: "Разрабатывает генеративные изображения для брендов и медиа.",
    baseBudget: 90000
  },
  {
    category: "AI",
    primaryRole: "Prompt designer",
    expertise: ["Промптинг", "LLM", "Прототипы"],
    focus: "Проектирует промпты и прототипы AI-функций для продуктов.",
    baseBudget: 120000
  },
  {
    category: "AI",
    primaryRole: "Creative technologist",
    expertise: ["AI", "Интерактив", "WebGL"],
    focus: "Соединяет креативные идеи, генеративные модели и интерактивные технологии.",
    baseBudget: 180000
  },
  {
    category: "Менеджмент",
    primaryRole: "Creative producer",
    expertise: ["Production", "Команды", "Сметы"],
    focus: "Собирает креативные команды и ведет проекты от брифа до релиза.",
    baseBudget: 160000
  },
  {
    category: "Менеджмент",
    primaryRole: "Project manager",
    expertise: ["Процессы", "Сроки", "Agile"],
    focus: "Организует прозрачное производство и синхронизирует участников проекта.",
    baseBudget: 100000
  },
  {
    category: "Менеджмент",
    primaryRole: "Talent producer",
    expertise: ["Кастинг", "Креаторы", "Переговоры"],
    focus: "Подбирает специалистов и управляет креаторскими коллаборациями.",
    baseBudget: 120000
  },
  {
    category: "Менеджмент",
    primaryRole: "Account director",
    expertise: ["Клиенты", "Стратегия", "Delivery"],
    focus: "Ведет сложные клиентские проекты и отвечает за качество результата.",
    baseBudget: 180000
  }
];

const firstNames = [
  "Алина",
  "Артем",
  "Варвара",
  "Глеб",
  "Дарья",
  "Егор",
  "Жанна",
  "Захар",
  "Инна",
  "Кирилл",
  "Лада",
  "Михаил",
  "Надежда",
  "Олег",
  "Полина",
  "Роман",
  "Софья",
  "Тимур",
  "Ульяна",
  "Федор",
  "Юлия",
  "Ярослав",
  "Элина",
  "Марк",
  "Ника"
];

const lastNames = [
  "Ким",
  "Ли",
  "Чен",
  "Мир",
  "Юн",
  "Рэй",
  "Бек",
  "Фокс",
  "Вега",
  "Норд",
  "Лайт",
  "Ривер",
  "Стоун",
  "Ло",
  "Хан",
  "Сон",
  "Ко",
  "Пак",
  "Дан",
  "Мун",
  "Тай",
  "Дин",
  "Росс",
  "Лин",
  "Ян"
];

const cities = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Нижний Новгород",
  "Самара",
  "Тбилиси",
  "Ереван",
  "Алматы",
  "Белград",
  "Берлин",
  "Стамбул",
  "Батуми",
  "Удаленно"
];

const extraExpertise = [
  "E-commerce",
  "Lifestyle",
  "Образование",
  "Fintech",
  "Culture",
  "Beauty",
  "HoReCa",
  "Music",
  "IT",
  "Startups"
];

function experienceLabel(years: number) {
  const lastTwo = years % 100;
  const last = years % 10;
  const unit = lastTwo >= 11 && lastTwo <= 14 ? "лет" : last === 1 ? "год" : last >= 2 && last <= 4 ? "года" : "лет";
  return `${years} ${unit}`;
}

export const generatedCreatorSeed: CreatorSeed[] = Array.from({ length: 100 }, (_, index) => {
  const template = roleTemplates[(index * 5) % roleTemplates.length];
  const experienceYears = 2 + ((index * 7) % 11);
  const level = experienceYears >= 8 ? "Senior" : experienceYears >= 4 ? "Middle" : "Junior";
  const number = String(index + 1).padStart(3, "0");
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[(index * 7 + Math.floor(index / firstNames.length)) % lastNames.length];
  const caseSector = extraExpertise[(index * 3) % extraExpertise.length];

  return {
    telegramId: String(11001 + index),
    telegramUsername: `creatin_demo_${number}`,
    firstName,
    lastName,
    city: cities[(index * 4) % cities.length],
    category: template.category,
    primaryRole: template.primaryRole,
    level,
    experienceYears,
    expertise: [...template.expertise, caseSector],
    bio: `${template.focus} ${experienceLabel(experienceYears)} практики, фокус на проектах в ${caseSector}.`,
    minBudget: template.baseBudget + ((index * 13) % 8) * 15000,
    hourlyRate: 4000 + ((index * 11) % 12) * 1000,
    workFormat: index % 3 === 0 ? "Part-time" : "Проект",
    availability: index % 4 === 0 ? "soon" : "available",
    score: 72 + ((index * 7) % 26),
    portfolioUrl: `https://portfolio.example/creatin-${number}`,
    photoUrl: dicebearAvatar(`creatin_demo_${number}`),
    cases: [
      `1. ${template.primaryRole}: проект для сегмента ${caseSector}`,
      `2. Коммерческий кейс — ${template.expertise[0]}`,
      `3. Авторский проект — ${template.expertise[1]}`
    ].join("\n")
  };
});
