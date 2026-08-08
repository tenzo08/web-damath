import type { GameState, Player, VariantId } from '@damath/engine';
import { encodeNnueFeatures } from './nnueFeatures.js';
import type { ToNumber } from './valueScale.js';

/**
 * The trained NNUE value network's weights, exported as plain JSON by
 * `training/train.py`'s `model.export_weights()` — see that file's doc comment for the
 * exact PyTorch-side layout this mirrors (`nn.Linear(in, out).weight` is `[out, in]`,
 * so `w1[j]` is already the row dotted against the 192-dim input, no transpose needed
 * here).
 */
export interface NnueWeights {
  readonly version: number;
  readonly inputSize: number;
  readonly w1: readonly (readonly number[])[];
  readonly b1: readonly number[];
  readonly w2: readonly (readonly number[])[];
  readonly b2: readonly number[];
  readonly w3: readonly (readonly number[])[];
  readonly b3: readonly number[];
}

/**
 * One dynamic `import()` per variant, not a template-string path — Vite's bundler
 * needs a statically analyzable specifier to code-split each variant's weights into
 * its own chunk, the same reasoning `App.tsx`'s extensive `lazy()` use already follows.
 * `with { type: 'json' }` is required under this workspace's `NodeNext` module
 * resolution (`tsconfig.base.json`) — Vite accepts it too, treating `.json` natively
 * either way.
 */
const WEIGHT_LOADERS: Readonly<Record<VariantId, () => Promise<{ default: unknown }>>> = {
  whole: () => import('./nnue-weights/whole.json', { with: { type: 'json' } }),
  counting: () => import('./nnue-weights/counting.json', { with: { type: 'json' } }),
  integer: () => import('./nnue-weights/integer.json', { with: { type: 'json' } }),
  fraction: () => import('./nnue-weights/fraction.json', { with: { type: 'json' } }),
  rational: () => import('./nnue-weights/rational.json', { with: { type: 'json' } }),
  radical: () => import('./nnue-weights/radical.json', { with: { type: 'json' } }),
  polynomial: () => import('./nnue-weights/polynomial.json', { with: { type: 'json' } }),
};

const weightsCache = new Map<VariantId, Promise<NnueWeights | null>>();

/** Loaded once per variant, then cached — every subsequent `nnueEvaluate` call for that variant reuses the same in-memory weights. Never throws: a missing/corrupt weight file resolves to `null`, same best-effort-degrade convention this codebase already uses elsewhere (e.g. the old `clientAchievements.ts`). */
export function loadNnueWeights(variantId: VariantId): Promise<NnueWeights | null> {
  let promise = weightsCache.get(variantId);
  if (!promise) {
    promise = WEIGHT_LOADERS[variantId]()
      .then((mod) => mod.default as NnueWeights)
      .catch(() => null);
    weightsCache.set(variantId, promise);
  }
  return promise;
}

function relu(x: number): number {
  return x > 0 ? x : 0;
}

/** `y[j] = activation(sum_i(w[j][i] * x[i]) + b[j])` — a plain dense layer, no library needed at this size. */
function denseLayer(input: readonly number[], weights: readonly (readonly number[])[], biases: readonly number[], activation: (x: number) => number): number[] {
  const output: number[] = new Array(weights.length);
  for (let j = 0; j < weights.length; j++) {
    const row = weights[j];
    const bias = biases[j] ?? 0;
    let sum = bias;
    if (row) {
      for (let i = 0; i < row.length; i++) {
        sum += (row[i] ?? 0) * (input[i] ?? 0);
      }
    }
    output[j] = activation(sum);
  }
  return output;
}

/**
 * The forward pass: 192 -> 64 (ReLU) -> 32 (ReLU) -> 1 (tanh), matching
 * `training/model.py`'s `DamathNNUE` exactly. Small enough (three loops, no matrix
 * library) that this stays a genuinely zero-runtime-dependency evaluator, in a browser
 * Web Worker, offline — the whole reason this design is viable where
 * `docs/AI_OPPONENT.md` §2 previously ruled an NNUE out.
 */
export function nnueForward(weights: NnueWeights, features: Float32Array): number {
  const input = Array.from(features);
  const hidden1 = denseLayer(input, weights.w1, weights.b1, relu);
  const hidden2 = denseLayer(hidden1, weights.w2, weights.b2, relu);
  const output = denseLayer(hidden2, weights.w3, weights.b3, Math.tanh);
  return output[0] ?? 0;
}

/**
 * The synchronous half: given *already-loaded* weights, evaluate one position. This is
 * what `evaluate.ts`'s leaf-node blending calls — `search.ts`'s alpha-beta recursion
 * runs fully synchronously today (`chooseMove` is called by dozens of existing sites as
 * a plain synchronous function, worker-protocol.ts included) and must stay that way.
 * The value network's output is always White-relative (training label convention,
 * `training/generate-selfplay.ts`) — sign-flip for a Black query, matching
 * `reference/damath-engine`'s `ai/nnue.py`'s own `evaluate()` convention.
 */
export function evaluateWithNnue<V>(weights: NnueWeights, state: GameState<V>, player: Player, toNumber: ToNumber<V>): number {
  const features = encodeNnueFeatures(state, toNumber);
  const whiteRelative = nnueForward(weights, features);
  return player === 'white' ? whiteRelative : -whiteRelative;
}

/**
 * The async half, for callers that don't already have weights loaded: resolves this
 * variant's weights (via the cache above) and evaluates once. Only ever call this
 * *outside* the search tree — e.g. once before starting a search, or in a test — never
 * from inside `alphaBeta`/`leaf`, which cannot await anything.
 */
export async function nnueEvaluate<V>(state: GameState<V>, player: Player, variantId: VariantId, toNumber: ToNumber<V>): Promise<number | null> {
  const weights = await loadNnueWeights(variantId);
  if (!weights) return null;
  return evaluateWithNnue(weights, state, player, toNumber);
}
