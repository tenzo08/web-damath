import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { FileUserStore } from './auth/store.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required — never falls back to a default secret.');
}

const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
const userStore = new FileUserStore(path.join(dataDir, 'users.json'));

const app = buildApp({ jwtSecret, userStore, logger: true });
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: '0.0.0.0' })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
