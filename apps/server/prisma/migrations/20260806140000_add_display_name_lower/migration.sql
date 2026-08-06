-- Added nullable first, backfilled, then made NOT NULL + UNIQUE -- `prisma migrate dev`
-- refuses to generate this in one interactive step against a table with existing rows
-- (2 in this database), since a required column with no default can't be added directly.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "displayNameLower" TEXT;

-- Backfill existing rows from the already-stored displayName.
UPDATE "User" SET "displayNameLower" = LOWER("displayName");

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "displayNameLower" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_displayNameLower_key" ON "User"("displayNameLower");
