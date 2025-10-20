-- CreateTable
CREATE TABLE "WhatsappSessionLock" (
    "apiKey" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WhatsappSessionLock_ownerId_idx" ON "WhatsappSessionLock"("ownerId");
