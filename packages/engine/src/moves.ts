import { BOARD_SIZE, isOnBoard, pieceAt } from './board.js';
import type { Board, CaptureStep, GameState, Move, Piece, Player, Position } from './types.js';

const DIAGONAL_DIRECTIONS: readonly Position[] = [
  { row: 1, col: 1 },
  { row: 1, col: -1 },
  { row: -1, col: 1 },
  { row: -1, col: -1 },
];

function add(a: Position, b: Position): Position {
  return { row: a.row + b.row, col: a.col + b.col };
}

function forwardDirections(player: Player): readonly Position[] {
  const dr = player === 'white' ? 1 : -1;
  return [
    { row: dr, col: 1 },
    { row: dr, col: -1 },
  ];
}

function key(pos: Position): string {
  return `${pos.row},${pos.col}`;
}

/**
 * Shared direction-scanning primitive (docs/LEGACY_AUDIT.md B7 — ordinary and
 * dama movement no longer duplicate this). Walks from `from` along `dir` one
 * square at a time, up to `range` steps, collecting each vacant square until
 * the board edge or an occupied square is reached. `range = 1` gives ordinary
 * one-step movement (§3.3); `range = Infinity` gives a dama's unbounded slide
 * (§6.3).
 */
function scanVacant(board: Board, from: Position, dir: Position, range: number): Position[] {
  const squares: Position[] = [];
  let pos = add(from, dir);
  let steps = 0;
  while (steps < range && isOnBoard(pos) && pieceAt(board, pos) === null) {
    squares.push(pos);
    pos = add(pos, dir);
    steps++;
  }
  return squares;
}

function quietMoves(board: Board, from: Position, piece: Piece): Move[] {
  const directions = piece.isDama ? DIAGONAL_DIRECTIONS : forwardDirections(piece.owner);
  const range = piece.isDama ? Infinity : 1;
  const moves: Move[] = [];
  for (const dir of directions) {
    for (const to of scanVacant(board, from, dir, range)) {
      moves.push({ from, to, captures: [] });
    }
  }
  return moves;
}

/** A square is passable/landable if it's genuinely empty, or was captured earlier in this chain (§4.6: removed immediately, so it reads as vacant even though the immutable board snapshot still shows the piece). */
function isVacantForChain(board: Board, pos: Position, captured: ReadonlySet<string>): boolean {
  return pieceAt(board, pos) === null || captured.has(key(pos));
}

/**
 * All complete capture sequences available to `piece` at `from`, recursing
 * through chain captures (§4.5) until no further jump is available. Ordinary
 * chips capture in any diagonal direction at fixed range (§3.4, §4.1); a dama
 * slides to the first enemy in a direction and may land on any vacant square
 * beyond it, each landing a distinct branch (§6.4).
 */
function captureSequences(
  board: Board,
  from: Position,
  piece: Piece,
  captured: ReadonlySet<string>,
): CaptureStep[][] {
  const sequences: CaptureStep[][] = [];

  const branch = (step: CaptureStep, nextCaptured: ReadonlySet<string>) => {
    const continuations = captureSequences(board, step.landedAt, piece, nextCaptured);
    if (continuations.length > 0) {
      for (const cont of continuations) sequences.push([step, ...cont]);
    } else {
      sequences.push([step]);
    }
  };

  for (const dir of DIAGONAL_DIRECTIONS) {
    if (piece.isDama) {
      let scan = add(from, dir);
      while (isOnBoard(scan) && isVacantForChain(board, scan, captured)) {
        scan = add(scan, dir);
      }
      if (!isOnBoard(scan)) continue;
      const enemy = pieceAt(board, scan);
      if (enemy === null || enemy.owner === piece.owner) continue;

      const enemyPos = scan;
      const nextCaptured = new Set(captured);
      nextCaptured.add(key(enemyPos));

      let landing = add(enemyPos, dir);
      while (isOnBoard(landing) && isVacantForChain(board, landing, captured)) {
        branch({ capturedPiece: enemy, capturedAt: enemyPos, landedAt: landing }, nextCaptured);
        landing = add(landing, dir);
      }
    } else {
      const enemyPos = add(from, dir);
      const landing = add(enemyPos, dir);
      if (!isOnBoard(landing)) continue;

      const enemy = pieceAt(board, enemyPos);
      if (enemy === null || enemy.owner === piece.owner || captured.has(key(enemyPos))) continue;
      if (!isVacantForChain(board, landing, captured)) continue;

      const nextCaptured = new Set(captured);
      nextCaptured.add(key(enemyPos));
      branch({ capturedPiece: enemy, capturedAt: enemyPos, landedAt: landing }, nextCaptured);
    }
  }

  return sequences;
}

/**
 * All legal moves for `state.turn`, enforcing capture priority in full
 * (§4.2-4.4): captures are mandatory whenever any exists, only maximum-count
 * sequences are legal among them, and dama captures prevail over ordinary
 * ones among the maximal set.
 */
export function legalMoves(state: GameState): Move[] {
  const { board, turn } = state;
  const captureMoves: Move[] = [];
  const quiet: Move[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row]?.[col];
      if (!piece || piece.owner !== turn) continue;

      const from: Position = { row, col };
      const sequences = captureSequences(board, from, piece, new Set());
      for (const seq of sequences) {
        // captureSequences never yields an empty sequence — branch() always pushes at least one step.
        const lastStep = seq.at(-1);
        if (!lastStep) {
          throw new Error('Capture sequence must not be empty');
        }
        captureMoves.push({ from, to: lastStep.landedAt, captures: seq });
      }
      if (sequences.length === 0) {
        quiet.push(...quietMoves(board, from, piece));
      }
    }
  }

  if (captureMoves.length === 0) {
    return quiet;
  }

  const maxCaptureCount = Math.max(...captureMoves.map((m) => m.captures.length));
  const maximalCaptures = captureMoves.filter((m) => m.captures.length === maxCaptureCount);

  const damaCaptures = maximalCaptures.filter((m) => pieceAt(board, m.from)?.isDama === true);
  return damaCaptures.length > 0 ? damaCaptures : maximalCaptures;
}
