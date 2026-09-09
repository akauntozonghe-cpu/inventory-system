-- AlterTable
ALTER TABLE "SystemCheckRun" ADD COLUMN     "contextRoute" TEXT,
ADD COLUMN     "errorReportId" TEXT;

-- CreateTable
CREATE TABLE "StocktakePresence" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StocktakePresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushSetting" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePushSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRead" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StocktakePresence_expiresAt_idx" ON "StocktakePresence"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StocktakePresence_sessionId_deviceId_key" ON "StocktakePresence"("sessionId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushSubscription_endpoint_key" ON "DevicePushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "DevicePushSubscription_userId_idx" ON "DevicePushSubscription"("userId");

-- CreateIndex
CREATE INDEX "DevicePushDelivery_sentAt_nextAttemptAt_idx" ON "DevicePushDelivery"("sentAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushDelivery_subscriptionId_notificationId_key" ON "DevicePushDelivery"("subscriptionId", "notificationId");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRead_notificationId_userId_key" ON "NotificationRead"("notificationId", "userId");

-- AddForeignKey
ALTER TABLE "StocktakePresence" ADD CONSTRAINT "StocktakePresence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StocktakeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakePresence" ADD CONSTRAINT "StocktakePresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushSubscription" ADD CONSTRAINT "DevicePushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushDelivery" ADD CONSTRAINT "DevicePushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "DevicePushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRead" ADD CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

