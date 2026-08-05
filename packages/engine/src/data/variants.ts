/**
 * The three integer-valued variants shipped in this milestone, transcribed from
 * docs/source/Damath-Rules.pdf p.3-4 (Whole and Counting) and p.3 (Integer).
 *
 * `values` is 12 numbers in the order printed in the rulebook: line 1 then line 2
 * then line 3, left to right within each line. This is deliberately *not* mapped
 * onto board squares yet — that belongs to `createGame`, out of scope this
 * session. When that mapping is built, apply Mapping A (KNOWLEDGE.md, "Chip-row
 * orientation"): the first line goes on the row nearest the centre, the third
 * line on the player's own back row.
 *
 * Data only — no arithmetic, no Arithmetic<V> interface (docs/adr/0002). That
 * abstraction is deferred to the Fraction variant, per the build order in
 * docs/VARIANTS.md.
 */

import type { IntegerVariantId } from '../types.js';

export type { IntegerVariantId } from '../types.js';

export interface IntegerVariant {
  readonly id: IntegerVariantId;
  readonly name: string;
  readonly gradeLevel: string;
  readonly values: readonly number[];
}

export const WHOLE_DAMATH: IntegerVariant = {
  id: 'whole',
  name: 'Whole Damath',
  gradeLevel: 'Grades 3–4',
  values: [9, 6, 1, 4, 0, 3, 10, 7, 11, 8, 5, 2],
};

export const COUNTING_DAMATH: IntegerVariant = {
  id: 'counting',
  name: 'Counting Damath',
  gradeLevel: 'Grades 1–2',
  values: [10, 7, 2, 5, 1, 4, 11, 8, 12, 9, 6, 3],
};

export const INTEGER_DAMATH: IntegerVariant = {
  id: 'integer',
  name: 'Integer Damath',
  gradeLevel: 'Grade 7',
  values: [-9, 6, -1, 4, 0, -3, 10, -7, -11, 8, -5, 2],
};

export const INTEGER_VARIANTS: readonly IntegerVariant[] = [
  WHOLE_DAMATH,
  COUNTING_DAMATH,
  INTEGER_DAMATH,
];
