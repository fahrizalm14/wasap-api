-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "apiKey" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "creds" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsappCredential" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "value" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsappCredential_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsappSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSession_apiKey_key" ON "WhatsappSession"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappCredential_sessionId_type_keyId_key" ON "WhatsappCredential"("sessionId", "type", "keyId");
