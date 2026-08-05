/**
 * A small, deterministic PRNG (mulberry32) — not cryptographic, just repeatable.
 * Search determinism (docs/AI_OPPONENT.md §2, "non-negotiable: without it the AI
 * cannot be tested") depends on every source of randomness — tie-break shuffling,
 * blunder selection — running through this, seeded, rather than `Math.random()`.
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniformly random integer in [0, exclusiveMax), drawn from `rng`. */
export function randomInt(rng: () => number, exclusiveMax: number): number {
  return Math.floor(rng() * exclusiveMax);
}
