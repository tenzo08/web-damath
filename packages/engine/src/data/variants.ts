/**
 * The three integer-valued variants, transcribed from docs/source/Damath-Rules.pdf
 * p.3-4 (Whole and Counting) and p.3 (Integer).
 *
 * `values` is 12 numbers in the order printed in the rulebook: line 1 then line 2
 * then line 3, left to right within each line. Mapped onto board squares by
 * `createGame` (KNOWLEDGE.md, "Chip-row orientation" — Mapping A: the first line
 * goes on the row nearest the centre, the third line on the player's own back row).
 */

import { numberArithmetic, type Variant } from '../arithmetic.js';

export const WHOLE_DAMATH: Variant<number> = {
  id: 'whole',
  name: 'Whole Damath',
  gradeLevel: 'Grades 3–4',
  values: [9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2],
  arithmetic: numberArithmetic,
};

export const COUNTING_DAMATH: Variant<number> = {
  id: 'counting',
  name: 'Counting Damath',
  gradeLevel: 'Grades 1–2',
  values: [10, 7, 2, 5, 1, 4, 11, 8, 12, 9, 6, 3],
  arithmetic: numberArithmetic,
};

export const INTEGER_DAMATH: Variant<number> = {
  id: 'integer',
  name: 'Integer Damath',
  gradeLevel: 'Grade 7',
  values: [-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2],
  arithmetic: numberArithmetic,
};

/** The three variants `packages/ai` plays (docs/AI_OPPONENT.md §4). */
export const INTEGER_VARIANTS: readonly Variant<number>[] = [WHOLE_DAMATH, COUNTING_DAMATH, INTEGER_DAMATH];
