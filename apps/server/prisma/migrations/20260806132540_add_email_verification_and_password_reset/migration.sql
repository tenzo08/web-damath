-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT,
ADD COLUMN     "verifyTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verifyTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "User_resetTokenHash_idx" ON "User"("resetTokenHash");

-- CreateIndex
CREATE INDEX "User_verifyTokenHash_idx" ON "User"("verifyTokenHash");
