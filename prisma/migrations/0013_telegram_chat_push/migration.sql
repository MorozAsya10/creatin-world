-- CreateTable
CREATE TABLE "TelegramChatPush" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "telegramMessageId" INTEGER NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChatPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChatPush_chatId_recipientUserId_key" ON "TelegramChatPush"("chatId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "TelegramChatPush" ADD CONSTRAINT "TelegramChatPush_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
