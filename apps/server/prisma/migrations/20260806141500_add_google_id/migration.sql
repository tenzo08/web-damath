-- Nullable, so this is safe against the existing rows -- Postgres treats every NULL as
-- distinct under a unique index, so no backfill is needed the way displayNameLower
-- needed one. Hand-written for the same reason as that migration: `prisma migrate dev`
-- refuses to run non-interactively when it has a warning to confirm, even a safe one.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
