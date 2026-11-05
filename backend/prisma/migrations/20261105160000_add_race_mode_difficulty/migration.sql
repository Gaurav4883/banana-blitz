-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "puzzlesPerGame" INTEGER NOT NULL DEFAULT 5;

-- CreateIndex
CREATE INDEX "PuzzleAttempt_puzzleId_userId_idx" ON "PuzzleAttempt"("puzzleId", "userId");

