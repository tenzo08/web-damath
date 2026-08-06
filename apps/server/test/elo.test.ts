import { describe, expect, it } from 'vitest';
import { BOT_TIER_RATING, expectedScore, nextRating, nextRatings, STARTING_RATING } from '../src/rating/elo.js';

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('is always symmetric: expectedScore(a, b) + expectedScore(b, a) === 1', () => {
    for (const [a, b] of [
      [1200, 1400],
      [800, 2000],
      [1500, 1500],
      [900, 850],
    ]) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1);
    }
  });

  it('favors the higher-rated player', () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(1200, 1600)).toBeLessThan(0.5);
  });

  it('a 400-point gap gives roughly a 10:1 win expectancy', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 2);
  });
});

describe('nextRating', () => {
  it('an equal-rated win gains rating, an equal-rated loss loses the same amount', () => {
    const afterWin = nextRating(1200, 1200, 'win');
    const afterLoss = nextRating(1200, 1200, 'loss');
    expect(afterWin).toBeGreaterThan(1200);
    expect(afterLoss).toBeLessThan(1200);
    expect(afterWin - 1200).toBe(1200 - afterLoss);
  });

  it('a draw between equal ratings changes nothing', () => {
    expect(nextRating(1200, 1200, 'draw')).toBe(1200);
  });

  it('beating a much lower-rated opponent gains very little', () => {
    const after = nextRating(1800, 1000, 'win');
    expect(after - 1800).toBeLessThanOrEqual(1);
  });

  it('beating a much higher-rated opponent (an upset) gains a lot', () => {
    const after = nextRating(1000, 1800, 'win');
    expect(after - 1000).toBeGreaterThan(25);
  });

  it('losing to a much lower-rated opponent loses a lot', () => {
    const after = nextRating(1800, 1000, 'loss');
    expect(1800 - after).toBeGreaterThan(25);
  });
});

describe('nextRatings', () => {
  it('is zero-sum: one side\'s gain exactly equals the other\'s loss, for a decisive result', () => {
    const { white, black } = nextRatings(1200, 1400, 'white');
    expect(white - 1200).toBe(-(black - 1400));
  });

  it('is zero-sum for a draw between unequal ratings too', () => {
    const { white, black } = nextRatings(1000, 1400, null);
    expect(white - 1000).toBe(-(black - 1400));
    // The lower-rated player gains from a draw against a stronger opponent.
    expect(white).toBeGreaterThan(1000);
    expect(black).toBeLessThan(1400);
  });

  it('a null winner (draw) between equal ratings changes neither', () => {
    const { white, black } = nextRatings(1200, 1200, null);
    expect(white).toBe(1200);
    expect(black).toBe(1200);
  });

  it('black winning lowers white\'s rating and raises black\'s', () => {
    const { white, black } = nextRatings(1300, 1300, 'black');
    expect(white).toBeLessThan(1300);
    expect(black).toBeGreaterThan(1300);
  });
});

describe('constants', () => {
  it('STARTING_RATING is the conventional 1200', () => {
    expect(STARTING_RATING).toBe(1200);
  });

  it('BOT_TIER_RATING is strictly increasing with difficulty, 400 points apart', () => {
    expect(BOT_TIER_RATING.learner).toBeLessThan(BOT_TIER_RATING.steady);
    expect(BOT_TIER_RATING.steady).toBeLessThan(BOT_TIER_RATING.sharp);
    expect(BOT_TIER_RATING.sharp).toBeLessThan(BOT_TIER_RATING.tournament);
    expect(BOT_TIER_RATING.steady - BOT_TIER_RATING.learner).toBe(400);
  });
});
