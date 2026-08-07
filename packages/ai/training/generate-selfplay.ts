/**
 * Self-play training-data generator for the NNUE evaluator — offline tooling, run via
 * `tsx`, never shipped to the browser (packages/ai/training/ is not imported by src/).
 *
 * For a given variant, plays N self-play games with the existing, already-tested
 * `chooseMove` (a shallow depth, for generation speed — diversity comes from varying
 * `blunderRate`/`seed` per game, the same mechanism `chooseMove` already has, not a new
 * exploration scheme) and records `{features, outcome}` for every position visited as
 * one NDJSON line. `outcome` is always from White's perspective (+1/0/-1), matching
 * `nnueFeatures.ts`'s perspective-neutral encoding — `nnueEval.ts` sign-flips at query
 * time for Black, the same convention `reference/damath-engine`'s `ai/nnue.py` uses.
 *
 * Usage:
 *   tsx training/generate-selfplay.ts --variant=whole --games=400
 *   tsx training/generate-selfplay.ts --all --games=400
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_VARIANTS, applyMove, createGame, finalScores, isGameOver } from '@damath/engine';
import type { AnyVariant, Variant, VariantId } from '@damath/engine';
import { AI_SUPPORTED_VARIANT_IDS, chooseMove, createRng, toNumberFor } from '../src/index.js';
import { encodeNnueFeatures } from '../src/nnueFeatures.js';

const DEFAULT_GAMES = 400;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_TIME_BUDGET_MS = 500;
const MAX_PLIES = 150;

interface SelfPlayExample {
  readonly features: number[];
  readonly outcome: -1 | 0 | 1;
}

type ValueOf<T> = T extends Variant<infer V> ? V : never;

/**
 * One self-play game, generation-depth search on both sides, returning every position
 * visited labelled with the game's final (White-perspective) outcome — the standard
 * AlphaZero-style value target, matching `reference/damath-engine`'s
 * `training/trainer.py` labelling convention.
 */
function playSelfPlayGame<V>(variant: Variant<V>, seed: number, maxDepth: number, timeBudgetMs: number): SelfPlayExample[] {
  const rng = createRng(seed);
  const toNumber = toNumberFor<V>(variant.id);
  let state = createGame(variant);
  const positions: Float32Array[] = [];
  let plies = 0;

  while (!isGameOver(state, variant) && plies < MAX_PLIES) {
    positions.push(encodeNnueFeatures(state, toNumber));
    // A different blunder rate per game (not per ply) is enough opening/midgame
    // diversity for a first training pass — `chooseMove` already has this mechanism,
    // no new exploration scheme needed (see module doc comment).
    const blunderRate = 0.1 + rng() * 0.3;
    const result = chooseMove(state, { maxDepth, timeBudgetMs, blunderRate, seed: seed + plies });
    state = applyMove(state, result.move, variant);
    plies++;
  }

  const exact = finalScores(state, variant.arithmetic);
  const whiteScore = toNumber(exact.white);
  const blackScore = toNumber(exact.black);
  const outcome: -1 | 0 | 1 = whiteScore === blackScore ? 0 : whiteScore > blackScore ? 1 : -1;

  return positions.map((features) => ({ features: Array.from(features), outcome }));
}

function generateForVariant(variant: AnyVariant, games: number, maxDepth: number, timeBudgetMs: number, outDir: string): void {
  const start = Date.now();
  const lines: string[] = [];
  for (let i = 0; i < games; i++) {
    const examples = playSelfPlayGame<ValueOf<typeof variant>>(variant, i * 7919 + 1, maxDepth, timeBudgetMs);
    for (const example of examples) lines.push(JSON.stringify(example));
  }
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${variant.id}.ndjson`);
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${variant.id}] ${String(games)} games -> ${String(lines.length)} positions in ${seconds}s -> ${outPath}`);
}

function parseArgs(argv: readonly string[]): { variantIds: readonly VariantId[]; games: number; maxDepth: number; timeBudgetMs: number } {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (match?.[1]) flags.set(match[1], match[2] ?? 'true');
  }
  const games = Number(flags.get('games') ?? DEFAULT_GAMES);
  const maxDepth = Number(flags.get('depth') ?? DEFAULT_MAX_DEPTH);
  const timeBudgetMs = Number(flags.get('time-budget-ms') ?? DEFAULT_TIME_BUDGET_MS);
  const variantFlag = flags.get('variant');
  const variantIds: readonly VariantId[] = flags.has('all')
    ? AI_SUPPORTED_VARIANT_IDS
    : variantFlag
      ? [variantFlag as VariantId]
      : [];
  if (variantIds.length === 0) {
    throw new Error('Pass --variant=<id> or --all. Known ids: ' + AI_SUPPORTED_VARIANT_IDS.join(', '));
  }
  return { variantIds, games, maxDepth, timeBudgetMs };
}

function main(): void {
  const { variantIds, games, maxDepth, timeBudgetMs } = parseArgs(process.argv.slice(2));
  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
  for (const id of variantIds) {
    const variant = ALL_VARIANTS.find((v) => v.id === id);
    if (!variant) throw new Error(`Unknown variant id "${id}"`);
    generateForVariant(variant, games, maxDepth, timeBudgetMs, outDir);
  }
}

main();
