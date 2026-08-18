-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'TELEGRAM';

-- CreateTable
CREATE TABLE "TelegramSupportThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminChatId" TEXT NOT NULL,
    "adminMessageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramSupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSupportThread_adminChatId_adminMessageId_key" ON "TelegramSupportThread"("adminChatId", "adminMessageId");

-- AddForeignKey
ALTER TABLE "TelegramSupportThread" ADD CONSTRAINT "TelegramSupportThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
