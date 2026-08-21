-- CreateIndex
CREATE INDEX "CreatorProfile_status_idx" ON "CreatorProfile"("status");

-- CreateIndex
CREATE INDEX "CreatorProfile_category_idx" ON "CreatorProfile"("category");

-- CreateIndex
CREATE INDEX "CreatorProfile_availability_idx" ON "CreatorProfile"("availability");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_clientProfileId_idx" ON "Order"("clientProfileId");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_orderId_idx" ON "Application"("orderId");

-- CreateIndex
CREATE INDEX "Application_creatorProfileId_idx" ON "Application"("creatorProfileId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
