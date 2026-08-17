-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('DRAFT', 'MODERATION', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ClientProfile"
ADD COLUMN "status" "ClientStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: клиенты, созданные до появления модерации, считаются уже одобренными
UPDATE "ClientProfile" SET "status" = 'APPROVED', "isApproved" = true;
