-- AlterTable
ALTER TABLE "PuzzleAttempt" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "SessionPlayer" (
    "id" TEXT NOT NULL,
    "gameSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionPlayer_userId_idx" ON "SessionPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionPlayer_gameSessionId_userId_key" ON "SessionPlayer"("gameSessionId", "userId");

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPlayer" ADD CONSTRAINT "SessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: whoever created an existing session becomes its first player
INSERT INTO "SessionPlayer" ("id", "gameSessionId", "userId")
SELECT 'sp_' || "id", "id", "userId" FROM "GameSession" WHERE "userId" IS NOT NULL;
