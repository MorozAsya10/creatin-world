-- CreateEnum
CREATE TYPE "CreatorModerationStage" AS ENUM ('REGISTRATION', 'PROFILE');

-- AlterTable
ALTER TABLE "CreatorProfile"
ADD COLUMN "moderationStage" "CreatorModerationStage" NOT NULL DEFAULT 'REGISTRATION';
