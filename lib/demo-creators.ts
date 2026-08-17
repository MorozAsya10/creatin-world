// Массовая генерация демо-креаторов (сотня профилей для правдоподобной
// ленты/каталога). Используется и из prisma/seed.ts (при первом запуске),
// и из app/api/admin/demo-creators/route.ts (чтобы админ мог перегенерить
// демо-данные без полного db:seed). upsert по telegramId — поэтому вызов
// идемпотентен: повторный запуск не плодит дубли, а обновляет существующих.
import { CreatorStatus, type PrismaClient, Role } from "@prisma/client";

import { generatedCreatorSeed, type CreatorSeed } from "@/prisma/creator-fixtures";

function profileData(item: CreatorSeed) {
  return {
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
    cases: item.cases || null,
    workFormat: item.workFormat,
    availability: item.availability,
    minBudget: item.minBudget,
    hourlyRate: item.hourlyRate,
    telegramContact: `@${item.telegramUsername}`,
    photoUrl: item.photoUrl,
    score: item.score,
    status: CreatorStatus.APPROVED,
    membershipPaid: true,
    isApproved: true
  };
}

export async function upsertGeneratedCreators(db: PrismaClient) {
  for (const item of generatedCreatorSeed) {
    await db.user.upsert({
      where: { telegramId: item.telegramId },
      update: {
        telegramUsername: item.telegramUsername,
        name: `${item.firstName} ${item.lastName}`,
        email: `${item.telegramUsername}@creatin.example`,
        role: Role.CREATOR,
        creatorProfile: {
          upsert: {
            create: profileData(item),
            update: profileData(item)
          }
        }
      },
      create: {
        telegramId: item.telegramId,
        telegramUsername: item.telegramUsername,
        name: `${item.firstName} ${item.lastName}`,
        email: `${item.telegramUsername}@creatin.example`,
        role: Role.CREATOR,
        creatorProfile: {
          create: profileData(item)
        }
      }
    });
  }

  return {
    upserted: generatedCreatorSeed.length,
    total: await db.creatorProfile.count()
  };
}
