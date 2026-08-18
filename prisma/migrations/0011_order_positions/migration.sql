-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('VACANCY', 'PROJECT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "kind" "OrderKind" NOT NULL DEFAULT 'VACANCY';
ALTER TABLE "Order" ADD COLUMN     "acceptsVolunteers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrderPosition" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isVolunteer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPosition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderPosition" ADD CONSTRAINT "OrderPosition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: у каждого уже существующего заказа появляется ровно одна позиция
-- (title = Order.title) — так старые отклики можно однозначно привязать к
-- позиции на следующем шаге, а вакансии (которые все существующие заказы и
-- есть на момент этой миграции) продолжают вести себя как "один отклик на
-- заказ".
INSERT INTO "OrderPosition" ("id", "orderId", "title", "isVolunteer", "createdAt")
SELECT gen_random_uuid()::text, "id", "title", false, "createdAt"
FROM "Order";

-- AlterTable: добавляем positionId сначала как nullable, чтобы заполнить его
-- для уже существующих откликов, и только потом делаем NOT NULL.
ALTER TABLE "Application" ADD COLUMN     "positionId" TEXT;

UPDATE "Application" AS a
SET "positionId" = op."id"
FROM "OrderPosition" AS op
WHERE op."orderId" = a."orderId";

ALTER TABLE "Application" ALTER COLUMN "positionId" SET NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "Application_orderId_creatorProfileId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Application_positionId_creatorProfileId_key" ON "Application"("positionId", "creatorProfileId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "OrderPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
