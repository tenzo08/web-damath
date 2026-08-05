import { describe, expect, it } from 'vitest';
import * as engine from '../src/index.js';

describe('public API surface', () => {
  it('exports the small API described in PLANNING.md', () => {
    const state = engine.createGame('integer');
    const moves = engine.legalMoves(state);
    expect(moves.length).toBeGreaterThan(0);

    const next = engine.applyMove(state, moves[0]!);
    expect(engine.isGameOver(next)).toBe(false);
    expect(typeof engine.finalScores(next).white).toBe('number');
    expect(typeof engine.finalScores(next).black).toBe('number');

    const restored = engine.deserialize(engine.serialize(next));
    expect(restored).toEqual(next);

    expect(engine.INTEGER_VARIANTS.map((v) => v.id)).toEqual(['whole', 'counting', 'integer']);
    expect(engine.operationAt({ row: 0, col: 1 })).toBe('+');
  });
});
