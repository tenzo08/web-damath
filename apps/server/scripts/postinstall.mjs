import { execSync } from 'node:child_process';

// A workspace-wide `pnpm install` (e.g. Vercel building apps/web, which has no
// business with Prisma at all) runs this postinstall too. DATABASE_URL only exists
// where the server actually deploys (Render, per render.yaml) -- skip instead of
// failing the whole install when it's absent, rather than making `prisma.config.ts`
// tolerate a missing connection string it should keep requiring everywhere else.
if (!process.env.DATABASE_URL) {
  console.log('apps/server postinstall: DATABASE_URL not set, skipping `prisma generate`');
  process.exit(0);
}

execSync('prisma generate', { stdio: 'inherit' });
