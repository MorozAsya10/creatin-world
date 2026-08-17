-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "notificationPreference" TEXT NOT NULL DEFAULT 'telegram';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "clientProfileId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_orderId_creatorProfileId_key"
ON "Invitation"("orderId", "creatorProfileId");

-- AddForeignKey
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_creatorProfileId_fkey"
FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_clientProfileId_fkey"
FOREIGN KEY ("clientProfileId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
