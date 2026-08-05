import { describe, expect, it } from 'vitest';
import * as engine from '../src/index.js';

describe('public API surface', () => {
  it('exports the small API described in PLANNING.md', () => {
    const state = engine.createGame(engine.INTEGER_DAMATH);
    const moves = engine.legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);

    const next = engine.applyMove(state, moves[0]!, engine.INTEGER_DAMATH);
    expect(engine.isGameOver(next, engine.INTEGER_DAMATH)).toBe(false);
    const totals = engine.finalScores(next, engine.numberArithmetic);
    expect(typeof totals.white).toBe('number');
    expect(typeof totals.black).toBe('number');

    const restored = engine.deserialize<number>(engine.serialize(next));
    expect(restored).toEqual(next);

    expect(engine.INTEGER_VARIANTS.map((v) => v.id)).toEqual(['whole', 'counting', 'integer']);
    expect(engine.operationAt({ row: 0, col: 1 })).toBe('+');
  });

  it('exports all seven variants, grade-ascending, each with 12 values', () => {
    expect(engine.ALL_VARIANTS.map((v) => v.id)).toEqual([
      'counting',
      'whole',
      'fraction',
      'integer',
      'rational',
      'radical',
      'polynomial',
    ]);
    // `ALL_VARIANTS` is a union of `Variant<number> | Variant<Fraction> | ...` — safe to
    // inspect structurally (every variant has 12 values), but calling `.arithmetic.format`
    // generically over the union isn't type-safe (V differs per member); each variant's
    // own `format` is exercised directly below and in its own data module's tests.
    for (const variant of engine.ALL_VARIANTS) {
      expect(variant.values).toHaveLength(12);
    }
  });

  it('formats each variant\'s own value type', () => {
    expect(engine.WHOLE_DAMATH.arithmetic.format(9)).toBe('9');
    expect(engine.FRACTION_DAMATH.arithmetic.format(engine.fraction(7, 10))).toBe('7/10');
    expect(engine.RADICAL_DAMATH.arithmetic.format(engine.radical(engine.fraction(3), 2))).toBe('3√2');
    expect(engine.POLYNOMIAL_DAMATH.arithmetic.format(engine.polynomial(engine.fraction(6), 1, 0))).toBe('6x');
  });
});
