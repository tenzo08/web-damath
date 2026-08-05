import { describe, expect, it } from 'vitest';
import { operationGlyph, operationVerb, operationWord, playerLabel, playerLetter, toAlgebraic } from './notation';

describe('toAlgebraic', () => {
  it('converts {row,col} to file+rank', () => {
    expect(toAlgebraic({ row: 0, col: 0 })).toBe('a1');
    expect(toAlgebraic({ row: 7, col: 7 })).toBe('h8');
    expect(toAlgebraic({ row: 2, col: 3 })).toBe('d3');
  });
});

describe('player labels', () => {
  it('maps white/black to Light/Dark per docs/DESIGN.md §7', () => {
    expect(playerLabel('white')).toBe('Light');
    expect(playerLabel('black')).toBe('Dark');
    expect(playerLetter('white')).toBe('L');
    expect(playerLetter('black')).toBe('D');
  });
});

describe('operation vocabulary', () => {
  it('has distinct glyph, noun, and verb forms for every operation', () => {
    for (const op of ['+', '-', '*', '/'] as const) {
      expect(operationGlyph(op)).toBeTruthy();
      expect(operationWord(op)).toBeTruthy();
      expect(operationVerb(op)).toBeTruthy();
    }
    expect(operationGlyph('*')).toBe('×');
    expect(operationGlyph('/')).toBe('÷');
    expect(operationWord('*')).toBe('multiplication');
    expect(operationVerb('*')).toBe('multiply');
  });
});
