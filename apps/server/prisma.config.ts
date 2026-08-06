import { defineConfig, env } from 'prisma/config';

// Prisma 7: the connection URL lives here now, not in schema.prisma's datasource block
// (that changed after this project's original Prisma knowledge — confirmed against a
// real `prisma migrate dev` run, which fails outright with the old url/directUrl schema
// fields, error P1012). The Prisma CLI runs this file standalone, separate from
// index.ts's own `process.loadEnvFile()` call, so `.env` needs loading here too — same
// native Node API, no `dotenv` dependency needed.
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
