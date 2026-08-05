/**
 * The actual Worker entry Vite bundles (`new URL('./ai-worker-entry.ts', import.meta.url)`
 * needs a real, statically resolvable file inside apps/web/src — a bare cross-package
 * specifier or a deep relative path into packages/ai isn't something Vite's worker
 * plugin can reliably analyze). All it does is load @damath/ai's actual worker, which
 * wires up self.onmessage as an import side effect (docs/AI_OPPONENT.md §3, §9).
 */
import '@damath/ai/src/worker.js';
