import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * One client for the whole process, shared by `PrismaUserStore`/`PrismaGameStore`/
 * `PrismaTournamentStore` — `index.ts` constructs this once and passes it into all
 * three, the same shape `FileUserStore`/`FileGameStore`/`FileTournamentStore` already
 * had (one `filePath` each, just now one shared connection pool instead). Prisma 7
 * requires an explicit driver adapter for the runtime client — the connection URL
 * alone (even via `prisma.config.ts`) isn't enough, confirmed against a real
 * `PrismaClientInitializationError` when it was missing.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
