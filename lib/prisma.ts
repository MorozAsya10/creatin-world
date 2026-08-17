// Стандартный для Next.js singleton PrismaClient: в dev-режиме модуль
// пересобирается при каждом hot-reload, поэтому без кеша на globalThis
// быстро упирались бы в лимит открытых соединений к Postgres.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
