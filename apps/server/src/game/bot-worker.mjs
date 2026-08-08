// The actual `new Worker(...)` entry point (`bot-pool.ts`) -- kept as plain, unambiguous
// ESM (not `.ts`) because Node's worker_threads loader can't parse TypeScript on its own,
// unlike the main thread where `tsx src/index.ts` (package.json's dev/start scripts)
// already wraps every source file. `tsx/esm/api`'s `tsImport` is tsx's own documented
// answer for this exact situation: load the real TS logic (bot-worker-runtime.ts) from
// inside a worker thread that didn't inherit the parent's tsx loader hook.
import { tsImport } from 'tsx/esm/api';

await tsImport('./bot-worker-runtime.ts', import.meta.url);
