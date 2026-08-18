// Основной сид: запускается через `pnpm db:seed`. Полностью пересоздаёт
// демо-данные с нуля (feature flags, пакеты, admin/demo-пользователей,
// 8 "витринных" креаторов с ручным описанием + 100 сгенерированных через
// creator-fixtures.ts, тестовые заказы/партнёры). Использовать при первом
// разворачивании проекта или чтобы сбросить БД в чистое демо-состояние —
// НЕ инкрементальный, старые демо-записи не сохраняются.
import { PrismaClient, Role, CreatorStatus, OrderStatus, OrderKind, ApplicationStatus } from "@prisma/client";
import { dicebearAvatar, generatedCreatorSeed, type CreatorSeed } from "./creator-fixtures";

const prisma = new PrismaClient();

const featuredCreatorSeed: CreatorSeed[] = [
  {
    telegramId: "10001",
    telegramUsername: "annakim",
    firstName: "Анна",
    lastName: "Ким",
    city: "Москва",
    category: "Дизайн",
    primaryRole: "Motion / 3D designer",
    level: "Senior",
    experienceYears: 7,
    expertise: ["3D", "Motion", "Fashion"],
    bio: "Визуальные системы и 3D-ролики для брендов.",
    minBudget: 180000,
    hourlyRate: 10000,
    workFormat: "Проект",
    availability: "available",
    score: 96
  },
  {
    telegramId: "10002",
    telegramUsername: "romanov",
    firstName: "Илья",
    lastName: "Романов",
    city: "Санкт-Петербург",
    category: "Менеджмент",
    primaryRole: "Creative producer",
    level: "Senior",
    experienceYears: 8,
    expertise: ["Production", "Teams", "Strategy"],
    bio: "Команды и проекты от идеи до релиза.",
    minBudget: 220000,
    hourlyRate: 12000,
    workFormat: "Проект",
    availability: "soon",
    score: 94
  },
  {
    telegramId: "10003",
    telegramUsername: "mariav",
    firstName: "Мария",
    lastName: "Волкова",
    city: "Москва",
    category: "Креатив",
    primaryRole: "Art director",
    level: "Senior",
    experienceYears: 6,
    expertise: ["Identity", "Campaigns", "Culture"],
    bio: "Айдентика и кампании с сильным визуальным языком.",
    minBudget: 200000,
    hourlyRate: 11000,
    workFormat: "Part-time",
    availability: "available",
    score: 92
  },
  {
    telegramId: "10004",
    telegramUsername: "denisyun",
    firstName: "Денис",
    lastName: "Юн",
    city: "Тбилиси",
    category: "AI",
    primaryRole: "AI video creator",
    level: "Middle",
    experienceYears: 4,
    expertise: ["Runway", "AI video", "Concept"],
    bio: "Генеративное видео и AI-production.",
    minBudget: 120000,
    hourlyRate: 8000,
    workFormat: "Проект",
    availability: "available",
    score: 89
  },
  {
    telegramId: "10005",
    telegramUsername: "olgasever",
    firstName: "Ольга",
    lastName: "Север",
    city: "Москва",
    category: "Маркетинг",
    primaryRole: "Brand strategist",
    level: "Senior",
    experienceYears: 7,
    expertise: ["Research", "Brand", "Naming"],
    bio: "Позиционирование, исследования и стратегии.",
    minBudget: 160000,
    hourlyRate: 9000,
    workFormat: "Проект",
    availability: "soon",
    score: 88
  },
  {
    telegramId: "10006",
    telegramUsername: "maxlevin",
    firstName: "Макс",
    lastName: "Левин",
    city: "Москва",
    category: "Видео",
    primaryRole: "Director / DOP",
    level: "Senior",
    experienceYears: 9,
    expertise: ["Film", "Ads", "Music"],
    bio: "Реклама, клипы и операторская работа.",
    minBudget: 250000,
    hourlyRate: 14000,
    workFormat: "Проект",
    availability: "available",
    score: 87
  },
  {
    telegramId: "10007",
    telegramUsername: "elenamir",
    firstName: "Елена",
    lastName: "Мир",
    city: "Ереван",
    category: "Тексты",
    primaryRole: "Copywriter",
    level: "Middle",
    experienceYears: 4,
    expertise: ["Tone of voice", "Editorial", "SMM"],
    bio: "Тексты для брендов, медиа и digital-продуктов.",
    minBudget: 80000,
    hourlyRate: 5000,
    workFormat: "Part-time",
    availability: "available",
    score: 84
  },
  {
    telegramId: "10008",
    telegramUsername: "sashali",
    firstName: "Саша",
    lastName: "Ли",
    city: "Алматы",
    category: "Дизайн",
    primaryRole: "UX/UI designer",
    level: "Middle",
    experienceYears: 4,
    expertise: ["UX", "UI", "Product"],
    bio: "Интерфейсы и продуктовые системы.",
    minBudget: 110000,
    hourlyRate: 6000,
    workFormat: "Проект",
    availability: "available",
    score: 81
  }
].map((item) => ({ ...item, photoUrl: dicebearAvatar(item.telegramUsername) }));

const creatorSeed = [...featuredCreatorSeed, ...generatedCreatorSeed];

async function main() {
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.application.deleteMany();
  await prisma.aiMatch.deleteMany();
  await prisma.aiLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.portfolioFile.deleteMany();
  await prisma.creatorProfile.deleteMany();
  await prisma.clientProfile.deleteMany();
  await prisma.package.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  await prisma.featureFlag.createMany({
    data: [
      {
        key: "payments.required",
        enabled: false,
        description: "Доступ открывается только после подтверждения оплаты."
      },
      {
        key: "moderation.required",
        enabled: false,
        description: "Анкеты и заказы требуют ручного решения администратора."
      },
      {
        key: "ai.external_required",
        enabled: false,
        description: "При недоступности внешнего AI резервный подбор не используется."
      }
    ]
  });

  const packages = await Promise.all(
    [
      {
        code: "single",
        title: "Одна вакансия",
        description: "Разовая публикация одного заказа в открытой ленте платформы.",
        placements: 1,
        databaseAccess: false,
        priceCents: 950000,
        perks: [
          "Публикация вакансии в ленте заказов",
          "AI-топ-3 подходящих креаторов",
          "Открытые контакты откликнувшихся",
          "Чат по заказу внутри платформы"
        ]
      },
      {
        code: "triple",
        title: "Три вакансии",
        description: "Пакет на три публикации — выгоднее при регулярном найме.",
        placements: 3,
        databaseAccess: true,
        priceCents: 2400000,
        perks: [
          "Публикация трёх вакансий в ленте",
          "AI-топ-3 по каждой вакансии",
          "Открытые контакты откликнувшихся",
          "Доступ к контактам всей базы креаторов",
          "Приглашать креаторов напрямую"
        ]
      }
    ].map((item) =>
      prisma.package.create({
        data: item
      })
    )
  );

  const admin = await prisma.user.create({
    data: {
      telegramId: "90001",
      telegramUsername: "creatin_admin",
      name: "CREATIN Administrator",
      role: Role.ADMIN
    }
  });

  const client = await prisma.user.create({
    data: {
      telegramId: "20001",
      telegramUsername: "northfounder",
      name: "Никита Романов",
      email: "hello@north.example",
      role: Role.CLIENT,
      clientProfile: {
        create: {
          companyName: "NORTH STUDIO",
          website: "north.example",
          industry: "Fashion / E-commerce",
          description: "Независимый бренд и digital-команда.",
          contactName: "Никита Романов",
          contactTitle: "Founder",
          legalType: "Юридическое лицо",
          inn: "7700000000",
          activePackageId: packages[1].id,
          hasDatabaseAccess: true,
          status: "APPROVED",
          isApproved: true
        }
      }
    },
    include: { clientProfile: true }
  });

  const creators = [];
  for (const item of creatorSeed) {
    const creator = await prisma.user.create({
      data: {
        telegramId: item.telegramId,
        telegramUsername: item.telegramUsername,
        name: `${item.firstName} ${item.lastName}`,
        email: `${item.telegramUsername}@creatin.example`,
        role: Role.CREATOR,
        creatorProfile: {
          create: {
            firstName: item.firstName,
            lastName: item.lastName,
            city: item.city,
            category: item.category,
            primaryRole: item.primaryRole,
            level: item.level,
            experienceYears: item.experienceYears,
            expertise: item.expertise,
            bio: item.bio,
            portfolioUrl: item.portfolioUrl || "https://portfolio.example",
            cases: item.cases || "1. Fashion campaign\n2. 3D product film\n3. Brand launch",
            workFormat: item.workFormat,
            availability: item.availability,
            minBudget: item.minBudget,
            hourlyRate: item.hourlyRate,
            telegramContact: `@${item.telegramUsername}`,
            photoUrl: item.photoUrl || dicebearAvatar(item.telegramUsername),
            score: item.score,
            status: CreatorStatus.APPROVED,
            membershipPaid: true,
            isApproved: true
          }
        }
      },
      include: { creatorProfile: true }
    });

    creators.push(creator);
  }

  const order21 = await prisma.order.create({
    data: {
      publicId: "ORD-021",
      clientProfileId: client.clientProfile!.id,
      title: "Айдентика для fashion-бренда",
      category: "Дизайн",
      description: "Нейминг, визуальная система и гайд для запуска первой коллекции.",
      requirements: "Опыт в fashion, сильная типографика, кейсы по айдентике.",
      budget: "180-250 тыс. ₽",
      deadline: "3 недели",
      initiator: "CLIENT",
      status: OrderStatus.PUBLISHED,
      publishedAt: new Date(),
      // Вакансия — одна позиция, дублирует title (см. OrderKind в schema.prisma).
      positions: { create: { title: "Айдентика для fashion-бренда" } }
    },
    include: { positions: true }
  });

  // Демо-вакансия с открытым волонтёрским откликом: показывает, что
  // acceptsVolunteers доступен не только проекту, но и вакансии с одним
  // "основным" откликом — на посте появляется вторая, бесплатная кнопка
  // отклика рядом с обычной (см. Order.acceptsVolunteers в schema.prisma).
  const order20 = await prisma.order.create({
    data: {
      publicId: "ORD-020",
      clientProfileId: client.clientProfile!.id,
      title: "Монтажер Reels на постоянный объем",
      category: "Видео",
      description: "20-25 вертикальных роликов в месяц.",
      requirements: "Чувство ритма, опыт с экспертным контентом.",
      budget: "90-130 тыс. ₽/мес.",
      deadline: "Долгосрочно",
      initiator: "CREATOR",
      status: OrderStatus.PUBLISHED,
      publishedAt: new Date(),
      acceptsVolunteers: true,
      positions: {
        create: [
          { title: "Монтажер Reels на постоянный объем" },
          { title: "Волонтёр", isVolunteer: true }
        ]
      }
    },
    include: { positions: true }
  });

  // Демо-проект: несколько именованных позиций под одним постом (сборка
  // команды) + открыт для волонтёрских откликов — см. Order.kind/
  // acceptsVolunteers в schema.prisma.
  const order18 = await prisma.order.create({
    data: {
      publicId: "ORD-018",
      clientProfileId: client.clientProfile!.id,
      title: "Креативная команда для спецпроекта",
      category: "Креатив",
      description: "Продюсер, арт-директор и motion-дизайнер.",
      requirements: "Опыт комплексных digital-кампаний.",
      budget: "от 450 тыс. ₽",
      deadline: "6 недель",
      initiator: "CLIENT",
      status: OrderStatus.COMPLETED,
      kind: OrderKind.PROJECT,
      acceptsVolunteers: true,
      positions: {
        create: [
          { title: "Продюсер" },
          { title: "Арт-директор" },
          { title: "Motion-дизайнер" },
          { title: "Волонтёр", isVolunteer: true }
        ]
      }
    },
    include: { positions: true }
  });

  await prisma.invitation.create({
    data: {
      orderId: order20.id,
      creatorProfileId: creators[0].creatorProfile!.id,
      clientProfileId: client.clientProfile!.id,
      message: "Ваш опыт в motion и fashion подходит для регулярного видеопродакшна. Предлагаем обсудить формат работы."
    }
  });

  const order21PositionId = order21.positions[0].id;

  const application = await prisma.application.create({
    data: {
      orderId: order21.id,
      positionId: order21PositionId,
      creatorProfileId: creators[0].creatorProfile!.id,
      status: ApplicationStatus.CHAT_OPEN,
      message: "Подходит мой опыт в fashion motion и запуске визуальных систем.",
      relevantCase: "https://portfolio.example/fashion",
      priceCents: 18000000,
      duration: "3 недели"
    }
  });

  await prisma.application.createMany({
    data: creators.slice(1, 6).map((creator, index) => ({
      orderId: order21.id,
      positionId: order21PositionId,
      creatorProfileId: creator.creatorProfile!.id,
      status: index < 2 ? ApplicationStatus.VIEWED : ApplicationStatus.SENT,
      message: "Готов(а) обсудить задачу и показать релевантные кейсы.",
      relevantCase: "https://portfolio.example/case",
      priceCents: (160000 + index * 20000) * 100,
      duration: index % 2 === 0 ? "3 недели" : "4 недели"
    }))
  });

  // Демо-отклики на проект ORD-018: разные креаторы откликаются на разные
  // позиции (включая волонтёрскую) — показывает независимость кнопок
  // отклика внутри одного проекта.
  const [producerPosition, artDirectorPosition, motionPosition, volunteerPosition] = order18.positions;
  await prisma.application.createMany({
    data: [
      {
        orderId: order18.id,
        positionId: producerPosition.id,
        creatorProfileId: creators[6].creatorProfile!.id,
        status: ApplicationStatus.ACCEPTED,
        message: "Продюсировал похожие спецпроекты, готов обсудить план.",
        relevantCase: "https://portfolio.example/producer",
        clientRecommended: true
      },
      {
        orderId: order18.id,
        positionId: artDirectorPosition.id,
        creatorProfileId: creators[2].creatorProfile!.id,
        status: ApplicationStatus.ACCEPTED,
        message: "Есть опыт арт-дирекшна digital-кампаний такого масштаба.",
        relevantCase: "https://portfolio.example/artdirection",
        clientRecommended: true
      },
      {
        orderId: order18.id,
        positionId: motionPosition.id,
        creatorProfileId: creators[0].creatorProfile!.id,
        status: ApplicationStatus.SENT,
        message: "Могу собрать motion-часть, есть свежие кейсы."
      },
      {
        orderId: order18.id,
        positionId: volunteerPosition.id,
        creatorProfileId: creators[7].creatorProfile!.id,
        status: ApplicationStatus.SENT,
        message: "Хочу поучаствовать волонтёром ради портфолио и опыта в команде."
      }
    ]
  });

  const chat = await prisma.chat.create({
    data: {
      orderId: order21.id,
      applicationId: application.id,
      clientProfileId: client.clientProfile!.id,
      creatorProfileId: creators[0].creatorProfile!.id
    }
  });

  await prisma.message.createMany({
    data: [
      {
        chatId: chat.id,
        senderId: client.id,
        body: "Привет! Спасибо за отклик. Хотим уточнить доступность на следующей неделе."
      },
      {
        chatId: chat.id,
        senderId: creators[0].id,
        body: "Привет! Свободна со вторника, могу начать с короткого брифа."
      }
    ]
  });

  await prisma.aiMatch.createMany({
    data: creators.slice(0, 3).map((creator, index) => ({
      orderId: order21.id,
      creatorProfileId: creator.creatorProfile!.id,
      rank: index + 1,
      score: creator.creatorProfile!.score,
      rationale: "Seed-рекомендация на основе категории, опыта и портфолио.",
      provider: "seed"
    }))
  });

  await prisma.promoCode.createMany({
    data: [
      { code: "CREATIN100", description: "Демо-промокод для полного доступа на первом этапе.", discountPct: 100 },
      { code: "FOUNDERS", description: "Промокод раннего участника.", discountPct: 50 }
    ]
  });

  await prisma.partner.createMany({
    data: [
      {
        title: "Курс «Motion design с нуля»",
        sponsorName: "Skillbox",
        description: "8 недель, портфолио из 4 проектов и разбор работ от практикующих моушн-дизайнеров.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-1/800/350",
        linkUrl: "https://skillbox.ru",
        position: 1
      },
      {
        title: "Онлайн-интенсив по нейросетям в дизайне",
        sponsorName: "Netology",
        description: "Практика с Midjourney, Runway и ComfyUI для креаторов, которые хотят ускорить продакшн.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-2/800/350",
        linkUrl: "https://netology.ru",
        position: 2
      },
      {
        title: "CRM для креативных агентств",
        sponsorName: "Studio OS",
        description: "Сметы, брифы и таймлайны проектов в одном сервисе — скидка 20% для платформы.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-3/800/350",
        linkUrl: "https://example.com/studio-os",
        position: 3
      },
      {
        title: "Курс «Продюсирование съёмок»",
        sponsorName: "Bang Bang Education",
        description: "Сметы, кастинг и логистика съёмочного дня для продюсеров и арт-директоров.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-4/800/350",
        linkUrl: "https://bangbangeducation.ru",
        position: 4
      },
      {
        title: "Банк для фрилансеров и самозанятых",
        sponsorName: "Точка",
        description: "Счёт, чеки для самозанятых и приём оплаты от заказчиков без бумажной волокиты.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-5/800/350",
        linkUrl: "https://tochka.com",
        position: 5
      },
      {
        title: "Сток-библиотека референсов и футажей",
        sponsorName: "Shutterstock",
        description: "Скидка 15% на подписку для видеографов и моушн-дизайнеров платформы.",
        imageUrl: "https://picsum.photos/seed/creatin-partner-6/800/350",
        linkUrl: "https://shutterstock.com",
        position: 6
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed.created",
      entity: "database",
      payload: {
        creators: creators.length,
        orders: 3,
        applications: 6,
        invitations: 1
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
