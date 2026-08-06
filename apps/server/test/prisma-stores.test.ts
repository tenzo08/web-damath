import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/db/prisma.js';

// Unlike index.ts (which always runs as the real server entrypoint), plain `vitest run`
// never loads apps/server/.env on its own — load it here so DATABASE_URL is actually
// available to skipIf below when a contributor has a local .env configured.
try {
  process.loadEnvFile();
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}
import { PrismaUserStore } from '../src/auth/store.js';
import { PrismaGameStore } from '../src/game/store.js';
import { PrismaTournamentStore } from '../src/tournament/store.js';
import type { PersistedGame } from '../src/game/store.js';
import type { PersistedTournament } from '../src/tournament/store.js';

// Real reads/writes against the live Neon database — not mocked, not a local file.
// Skips itself entirely wherever DATABASE_URL isn't set (CI, a contributor without
// their own Postgres) rather than failing; this is deliberately the one test file in
// the suite that needs real infrastructure outside the repo. Every row it creates is a
// throwaway with a random id/email, cleaned up in `afterAll`.
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('Prisma-backed stores against a real Postgres database', () => {
  const prisma = createPrismaClient(DATABASE_URL ?? '');
  const userStore = new PrismaUserStore(prisma);
  const gameStore = new PrismaGameStore(prisma);
  const tournamentStore = new PrismaTournamentStore(prisma);

  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdTournamentIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
    await prisma.$disconnect();
  });

  it('PrismaUserStore: create, findByEmail, findById, and update round-trip correctly', async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    const email = `prisma-test-${id}@example.com`;

    await userStore.create({ id, email, passwordHash: 'hash', displayName: 'Prisma Test', rating: 1200, createdAt: new Date().toISOString() });

    const byEmail = await userStore.findByEmail(email);
    expect(byEmail).toMatchObject({ id, email, displayName: 'Prisma Test', rating: 1200 });

    const byId = await userStore.findById(id);
    expect(byId?.email).toBe(email);

    if (!byId) throw new Error('expected the user to be found by id');
    await userStore.update({ ...byId, rating: 1450, displayName: 'Updated Name' });

    const afterUpdate = await userStore.findById(id);
    expect(afterUpdate).toMatchObject({ rating: 1450, displayName: 'Updated Name' });
  });

  it('PrismaUserStore: findByDisplayName is case-insensitive and stays in sync after update', async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    const email = `prisma-test-${id}@example.com`;

    await userStore.create({
      id,
      email,
      passwordHash: 'hash',
      displayName: 'CaseCheck Prisma',
      rating: 1200,
      createdAt: new Date().toISOString(),
    });

    expect((await userStore.findByDisplayName('casecheck prisma'))?.id).toBe(id);
    expect((await userStore.findByDisplayName('CASECHECK PRISMA'))?.id).toBe(id);

    const current = await userStore.findById(id);
    if (!current) throw new Error('expected the user to be found by id');
    await userStore.update({ ...current, displayName: 'Renamed Prisma' });

    expect(await userStore.findByDisplayName('casecheck prisma')).toBeNull();
    expect((await userStore.findByDisplayName('renamed prisma'))?.id).toBe(id);
  });

  it('PrismaGameStore: create, findById, and update round-trip correctly, including tournamentMatch', async () => {
    const id = randomUUID();
    createdGameIds.push(id);
    const now = new Date().toISOString();
    const game: PersistedGame = {
      id,
      variantId: 'integer',
      players: { white: 'user-a', black: 'user-b' },
      opponentType: 'human',
      botTier: null,
      moveHistory: [{ from: { row: 2, col: 1 }, to: { row: 3, col: 0 }, captures: [] }],
      status: 'active',
      resignedBy: null,
      tournamentMatch: { tournamentId: 'tourn-1', round: 1, index: 0 },
      createdAt: now,
      updatedAt: now,
    };

    await gameStore.create(game);
    const found = await gameStore.findById(id);
    expect(found).toMatchObject({
      variantId: 'integer',
      players: { white: 'user-a', black: 'user-b' },
      tournamentMatch: { tournamentId: 'tourn-1', round: 1, index: 0 },
    });
    expect(found?.moveHistory).toHaveLength(1);

    if (!found) throw new Error('expected the game to be found');
    const updated: PersistedGame = { ...found, status: 'finished', resignedBy: 'white', updatedAt: new Date().toISOString() };
    await gameStore.update(updated);

    const afterUpdate = await gameStore.findById(id);
    expect(afterUpdate).toMatchObject({ status: 'finished', resignedBy: 'white' });
  });

  it('PrismaGameStore: a game with no tournament match round-trips tournamentMatch as null', async () => {
    const id = randomUUID();
    createdGameIds.push(id);
    const now = new Date().toISOString();
    await gameStore.create({
      id,
      variantId: 'whole',
      players: { white: 'user-a', black: null },
      opponentType: 'human',
      botTier: null,
      moveHistory: [],
      status: 'active',
      resignedBy: null,
      tournamentMatch: null,
      createdAt: now,
      updatedAt: now,
    });
    const found = await gameStore.findById(id);
    expect(found?.tournamentMatch).toBeNull();
  });

  it('PrismaTournamentStore: create, findById, findByJoinCode, update, and list round-trip correctly', async () => {
    const id = randomUUID();
    createdTournamentIds.push(id);
    const joinCode = id.slice(0, 6).toUpperCase();
    const now = new Date().toISOString();
    const tournament: PersistedTournament = {
      id,
      name: 'Prisma Test Cup',
      variantId: 'integer',
      creatorUserId: 'user-a',
      joinCode,
      participants: ['user-a'],
      bracket: null,
      status: 'lobby',
      startTime: '2026-09-01T08:00:00.000Z',
      endTime: '2026-09-01T17:00:00.000Z',
      createdAt: now,
      updatedAt: now,
    };

    await tournamentStore.create(tournament);

    const byId = await tournamentStore.findById(id);
    expect(byId).toMatchObject({ name: 'Prisma Test Cup', startTime: '2026-09-01T08:00:00.000Z', endTime: '2026-09-01T17:00:00.000Z' });

    const byCode = await tournamentStore.findByJoinCode(joinCode);
    expect(byCode?.id).toBe(id);

    if (!byId) throw new Error('expected the tournament to be found');
    await tournamentStore.update({ ...byId, participants: ['user-a', 'user-b'], status: 'in_progress' });

    const afterUpdate = await tournamentStore.findById(id);
    expect(afterUpdate).toMatchObject({ participants: ['user-a', 'user-b'], status: 'in_progress' });

    const list = await tournamentStore.list();
    expect(list.some((t) => t.id === id)).toBe(true);
  });
});
