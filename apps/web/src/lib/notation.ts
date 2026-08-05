import type { Operation, Player, Position } from '@damath/engine';

const FILES = 'abcdefgh';

/** Board coordinate as algebraic notation, e.g. {row:2,col:3} -> "d3". */
export function toAlgebraic(pos: Position): string {
  return `${FILES[pos.col] ?? '?'}${String(pos.row + 1)}`;
}

/** docs/DESIGN.md §7: the engine's internal Player stays white/black; the UI shows Light/Dark. */
export function playerLabel(player: Player): 'Light' | 'Dark' {
  return player === 'white' ? 'Light' : 'Dark';
}

export function playerLetter(player: Player): 'L' | 'D' {
  return player === 'white' ? 'L' : 'D';
}

const OPERATION_GLYPH: Record<Operation, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

export function operationGlyph(op: Operation): string {
  return OPERATION_GLYPH[op];
}

const OPERATION_WORD: Record<Operation, string> = {
  '+': 'addition',
  '-': 'subtraction',
  '*': 'multiplication',
  '/': 'division',
};

export function operationWord(op: Operation): string {
  return OPERATION_WORD[op];
}

const OPERATION_VERB: Record<Operation, string> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
};

/** docs/DESIGN.md §6: square accessible names use the verb form ("multiply"), not the noun form used in move announcements ("multiplication"). */
export function operationVerb(op: Operation): string {
  return OPERATION_VERB[op];
}
