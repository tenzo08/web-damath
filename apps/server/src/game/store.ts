import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Player, VariantId } from '@damath/engine';
import type { Prisma, PrismaClient } from '@prisma/client';

/** The special "player id" for the bot's seat — never a real user id (UUIDs never collide with it). */
export const BOT_PLAYER_ID = 'bot';

export interface PersistedGame {
  readonly id: string;
  readonly variantId: VariantId;
  readonly players: { readonly white: string | null; readonly black: string | null };
  readonly opponentType: 'human' | 'bot';
  readonly botTier: string | null;
  /** A friendly name (botNames.ts), never "Computer" or the tier -- opponentType/botTier still carry the real, tracked fact that this is a bot game (leaderboard exclusion, etc.); this is only what a player sees. Null for a human game. */
  readonly botNickname: string | null;
  /**
   * `Move<V>[]`, stored as `unknown` here — this layer never inspects a chip value, it
   * only persists and returns the move list. `readMoveHistory<V>` at the call site
   * (`rooms.ts`) is the one place that re-attaches a concrete `V`, the same JSON-boundary
   * trust point `deserialize` already uses (docs/adr/0002; PLANNING.md, "a game is its
   * move list").
   */
  readonly moveHistory: readonly unknown[];
  readonly status: 'active' | 'finished';
  /** UI-level state, not an engine concept — see KNOWLEDGE.md's "Resignation is UI state, not an engine concept." Persisted here (unlike the hot-seat client) because the server is authoritative across reconnects. */
  readonly resignedBy: Player | null;
  /** A real draw the players agreed to (draw offer + acceptance) — distinct from a score-tie or resignation, same "UI-level, not an engine concept" reasoning as `resignedBy`. */
  readonly drawnByAgreement: boolean;
  /** Set only for a room created to play a specific tournament bracket match — `rooms.ts` reports the result back to `TournamentManager` automatically once such a room finishes. */
  readonly tournamentMatch: { readonly tournamentId: string; readonly round: number; readonly index: number } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GameStore {
  create(game: PersistedGame): Promise<void>;
  findById(id: string): Promise<PersistedGame | null>;
  /** Replaces one game's `moveHistory`/`status`/`updatedAt` after a validated move — never partial-patches, always the whole persisted record. */
  update(game: PersistedGame): Promise<void>;
  /** Every game `userId` was seated in (either color), most recently updated first — the source for the match-history page. `limit` bounds a runaway history, not a pagination cursor; this app doesn't need real pagination at classroom scale. */
  listForUser(userId: string, limit: number): Promise<PersistedGame[]>;
  /**
   * Every currently-in-progress human-vs-human game with both seats filled — the
   * source for the spectator list. Queries the persisted store directly rather than
   * `RoomManager`'s in-memory room cache, which starts empty after every server
   * restart and only refills as each room happens to be touched again — a genuinely
   * live game a spectator hasn't found yet would otherwise be invisible right after a
   * cold start (Render's free tier spins down and wakes on the next request).
   */
  listActive(limit: number): Promise<PersistedGame[]>;
}

/**
 * One JSON file per game in `gamesDir`, not one growing array in a single file — the
 * earlier single-file design meant `update` (called on every move, `room.ts`'s `commit`,
 * awaited before the move is broadcast) read-parsed and re-serialized-and-rewrote every
 * game ever played on this server, on every single move of every active game: an O(total
 * games) cost sitting directly in the per-move latency path, and one that only grew as a
 * deployment aged. Per-game files make `create`/`findById`/`update` — the hot,
 * per-move-and-per-game-start operations — O(1) against that game's own (small) history
 * instead. `listForUser`/`listActive` (match history, the spectator list) still scan
 * every file, same cost as before, but those aren't in the move-latency path.
 *
 * Same concurrency scope decision as `auth/store.ts`'s `FileUserStore` (KNOWLEDGE.md) —
 * not safe for concurrent writers across processes, fine for a single dev server
 * instance. Real persistence (Postgres+Prisma, `PrismaGameStore` below) doesn't have
 * either limitation and is what a real deployment should set `DATABASE_URL` for.
 */
export class FileGameStore implements GameStore {
  constructor(private readonly gamesDir: string) {}

  private pathFor(id: string): string {
    return path.join(this.gamesDir, `${id}.json`);
  }

  private async readOne(id: string): Promise<PersistedGame | null> {
    try {
      const raw = await readFile(this.pathFor(id), 'utf-8');
      return JSON.parse(raw) as PersistedGame;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  private async writeOne(game: PersistedGame): Promise<void> {
    await mkdir(this.gamesDir, { recursive: true });
    await writeFile(this.pathFor(game.id), JSON.stringify(game, null, 2), 'utf-8');
  }

  private async readAll(): Promise<PersistedGame[]> {
    let entries: string[];
    try {
      entries = await readdir(this.gamesDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const raw = await Promise.all(
      entries.filter((name) => name.endsWith('.json')).map((name) => readFile(path.join(this.gamesDir, name), 'utf-8')),
    );
    return raw.map((json) => JSON.parse(json) as PersistedGame);
  }

  async create(game: PersistedGame): Promise<void> {
    await this.writeOne(game);
  }

  async findById(id: string): Promise<PersistedGame | null> {
    return this.readOne(id);
  }

  async update(game: PersistedGame): Promise<void> {
    const existing = await this.readOne(game.id);
    if (!existing) throw new Error(`no persisted game with id ${game.id}`);
    await this.writeOne(game);
  }

  async listForUser(userId: string, limit: number): Promise<PersistedGame[]> {
    const games = await this.readAll();
    return games
      .filter((g) => g.players.white === userId || g.players.black === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async listActive(limit: number): Promise<PersistedGame[]> {
    const games = await this.readAll();
    return games
      .filter(
        (g) =>
          g.opponentType === 'human' &&
          g.status !== 'finished' &&
          g.resignedBy === null &&
          !g.drawnByAgreement &&
          g.players.white !== null &&
          g.players.black !== null,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
}

/**
 * The real thing — a thin adapter over Prisma's generated `Game` model
 * (`prisma/schema.prisma`), used whenever `DATABASE_URL` is set (`index.ts`).
 * `players`/`tournamentMatch` are flattened into separate nullable columns on the DB
 * side (`whitePlayerId`/`blackPlayerId`, `tournamentId`/`tournamentRound`/
 * `tournamentIndex`) rather than kept as nested JSON, so a future "find all of this
 * user's games" query doesn't need to reach inside a JSON blob — `toRow`/`toPersistedGame`
 * are the two directions of that mapping.
 */
export class PrismaGameStore implements GameStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(game: PersistedGame): Promise<void> {
    await this.prisma.game.create({ data: toRow(game) });
  }

  async findById(id: string): Promise<PersistedGame | null> {
    const row = await this.prisma.game.findUnique({ where: { id } });
    return row ? toPersistedGame(row) : null;
  }

  async update(game: PersistedGame): Promise<void> {
    const { id, ...data } = toRow(game);
    await this.prisma.game.update({ where: { id }, data });
  }

  async listForUser(userId: string, limit: number): Promise<PersistedGame[]> {
    const rows = await this.prisma.game.findMany({
      where: { OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }] },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(toPersistedGame);
  }

  async listActive(limit: number): Promise<PersistedGame[]> {
    const rows = await this.prisma.game.findMany({
      where: {
        opponentType: 'human',
        status: { not: 'finished' },
        resignedBy: null,
        drawnByAgreement: false,
        whitePlayerId: { not: null },
        blackPlayerId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(toPersistedGame);
  }
}

function toRow(game: PersistedGame) {
  return {
    id: game.id,
    variantId: game.variantId,
    whitePlayerId: game.players.white,
    blackPlayerId: game.players.black,
    opponentType: game.opponentType,
    botTier: game.botTier,
    botNickname: game.botNickname,
    moveHistory: game.moveHistory as Prisma.InputJsonValue,
    status: game.status,
    resignedBy: game.resignedBy,
    drawnByAgreement: game.drawnByAgreement,
    tournamentId: game.tournamentMatch?.tournamentId ?? null,
    tournamentRound: game.tournamentMatch?.round ?? null,
    tournamentIndex: game.tournamentMatch?.index ?? null,
    createdAt: new Date(game.createdAt),
    updatedAt: new Date(game.updatedAt),
  };
}

interface PrismaGameRow {
  id: string;
  variantId: string;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  opponentType: string;
  botTier: string | null;
  botNickname: string | null;
  moveHistory: Prisma.JsonValue;
  status: string;
  resignedBy: string | null;
  drawnByAgreement: boolean;
  tournamentId: string | null;
  tournamentRound: number | null;
  tournamentIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPersistedGame(row: PrismaGameRow): PersistedGame {
  return {
    id: row.id,
    variantId: row.variantId as VariantId,
    players: { white: row.whitePlayerId, black: row.blackPlayerId },
    opponentType: row.opponentType as 'human' | 'bot',
    botTier: row.botTier,
    botNickname: row.botNickname,
    moveHistory: row.moveHistory as readonly unknown[],
    status: row.status as 'active' | 'finished',
    resignedBy: row.resignedBy as Player | null,
    drawnByAgreement: row.drawnByAgreement,
    tournamentMatch:
      row.tournamentId !== null && row.tournamentRound !== null && row.tournamentIndex !== null
        ? { tournamentId: row.tournamentId, round: row.tournamentRound, index: row.tournamentIndex }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
