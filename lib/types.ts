// Клиентские (фронтовые) типы для данных, которые приходят из app/api/**.
// Это НЕ модели Prisma — тут только то, что реально сериализуется в JSON
// API-роутами (никаких служебных/приватных полей). Держится отдельно от
// prisma/schema.prisma намеренно, чтобы бэкенд мог скрывать/переименовывать
// поля в ответах без утечки внутренней структуры БД на фронт. При добавлении
// нового поля в API-ответ — не забыть продублировать его здесь.
export type Role = "CREATOR" | "CLIENT" | "ADMIN";

export type ApiUser = {
  id: string;
  name: string;
  email?: string | null;
  notificationPreference?: "telegram" | "platform";
  role: Role;
  telegramUsername?: string | null;
  creatorProfile?: CreatorProfile | null;
  clientProfile?: ClientProfile | null;
};

export type CreatorProfile = {
  id: string;
  firstName: string;
  lastName: string;
  city?: string | null;
  category: string;
  primaryRole: string;
  level: string;
  experienceYears: number;
  expertise: string[];
  bio: string;
  portfolioUrl?: string | null;
  cases?: string | null;
  workFormat: string;
  availability: string;
  minBudget: number;
  hourlyRate?: number | null;
  telegramContact?: string | null;
  photoUrl?: string | null;
  score: number;
  status: string;
  membershipPaid: boolean;
  isApproved: boolean;
  user?: ApiUser;
  files?: PortfolioFile[];
  // Агрегаты по Application.clientRecommended — считаются на бэке в
  // GET /api/creators (см. lib/types.ts:: комментарий у Application ниже).
  // reviewedOrdersCount — сколько завершённых заказов заказчики уже оценили,
  // recommendedCount — из них сколько сказали "рекомендую". Оба undefined,
  // если бэкенд их не прислал (например, в других API-ответах).
  reviewedOrdersCount?: number;
  recommendedCount?: number;
};

export type PortfolioFile = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
};

export type ClientProfile = {
  id: string;
  companyName: string;
  website?: string | null;
  industry: string;
  description?: string | null;
  contactName: string;
  contactTitle?: string | null;
  legalType?: string | null;
  inn?: string | null;
  hasDatabaseAccess: boolean;
  activePackageId?: string | null;
  status: string;
  isApproved: boolean;
};

export type PackagePlan = {
  id: string;
  code: string;
  title: string;
  description: string;
  priceCents?: number | null;
  placements?: number | null;
  databaseAccess: boolean;
  perks?: string[];
};

export type Order = {
  id: string;
  publicId: string;
  title: string;
  category: string;
  description: string;
  requirements: string;
  budget: string;
  deadline: string;
  initiator: "CLIENT" | "CREATOR";
  status: string;
  // VACANCY — один отклик на весь заказ; PROJECT — несколько именованных
  // позиций, на каждую свой отклик (сборка команды), см. OrderPosition.
  kind: "VACANCY" | "PROJECT";
  acceptsVolunteers: boolean;
  positions?: OrderPosition[];
  clientProfile?: ClientProfile;
  _count?: { applications: number };
  applications?: Application[];
  aiMatches?: AiMatch[];
  invitations?: Invitation[];
};

// Позиция внутри заказа — то, на что реально откликается креатор (см.
// комментарий у Order.kind). У вакансии всегда ровно одна.
export type OrderPosition = {
  id: string;
  title: string;
  isVolunteer: boolean;
  applications?: Application[];
};

export type Application = {
  id: string;
  status: string;
  message: string;
  relevantCase?: string | null;
  priceCents?: number | null;
  duration?: string | null;
  // null = заказчик пока не оценивал (или заказ ещё не завершён);
  // true/false — оценка "рекомендую"/"не рекомендую", см. POST
  // /api/applications/[id]/recommend.
  clientRecommended?: boolean | null;
  positionId?: string;
  position?: OrderPosition;
  order?: Order;
  creatorProfile?: CreatorProfile;
  chat?: Chat | null;
};

export type AiMatch = {
  id: string;
  rank: number;
  score: number;
  rationale: string;
  provider: string;
  creatorProfile: CreatorProfile;
};

export type Chat = {
  id: string;
  createdAt: string;
  updatedAt: string;
  order: Order;
  application: Application;
  clientProfile: ClientProfile & { user?: ApiUser };
  creatorProfile: CreatorProfile & { user?: ApiUser };
  messages: Message[];
};

export type Invitation = {
  id: string;
  message: string;
  status: "SENT" | "ACCEPTED" | "DECLINED";
  order: Order;
  creatorProfile: CreatorProfile;
  clientProfile?: ClientProfile;
  createdAt: string;
};

export type Message = {
  id: string;
  body: string;
  senderId: string;
  sender: ApiUser;
  createdAt: string;
};

export type Partner = {
  id: string;
  title: string;
  sponsorName: string;
  description: string;
  imageUrl?: string | null;
  linkUrl: string;
  active: boolean;
  position: number;
  createdAt: string;
};

export type FeatureFlags = {
  paymentsRequired: boolean;
  moderationRequired: boolean;
  aiExternalRequired: boolean;
};
