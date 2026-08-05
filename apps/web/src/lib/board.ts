import type { Position } from '@damath/engine';

export const BOARD_SIZE = 8;

export function isPlayable(pos: Position): boolean {
  return (pos.row + pos.col) % 2 === 1;
}

export function isOnBoard(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_SIZE && pos.col >= 0 && pos.col < BOARD_SIZE;
}

export function positionKey(pos: Position): string {
  return `${String(pos.row)},${String(pos.col)}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}
