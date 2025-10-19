-- CreateTable
CREATE TABLE "ApiKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WhatsappSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "apiKey" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "creds" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsappSession_apiKey_fkey" FOREIGN KEY ("apiKey") REFERENCES "ApiKey" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WhatsappSession" ("apiKey", "createdAt", "creds", "displayName", "id", "status", "updatedAt") SELECT "apiKey", "createdAt", "creds", "displayName", "id", "status", "updatedAt" FROM "WhatsappSession";
DROP TABLE "WhatsappSession";
ALTER TABLE "new_WhatsappSession" RENAME TO "WhatsappSession";
CREATE UNIQUE INDEX "WhatsappSession_apiKey_key" ON "WhatsappSession"("apiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
