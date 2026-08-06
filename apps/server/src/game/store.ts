import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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
}

/**
 * A JSON file, same scope decision as `auth/store.ts`'s `FileUserStore` and for the
 * same reason (KNOWLEDGE.md) — not safe for concurrent writers across processes, fine
 * for a single dev server instance. Real persistence (Postgres+Prisma) is Milestone 6.
 */
export class FileGameStore implements GameStore {
  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<PersistedGame[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as PersistedGame[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(games: PersistedGame[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(games, null, 2), 'utf-8');
  }

  async create(game: PersistedGame): Promise<void> {
    const games = await this.readAll();
    games.push(game);
    await this.writeAll(games);
  }

  async findById(id: string): Promise<PersistedGame | null> {
    const games = await this.readAll();
    return games.find((g) => g.id === id) ?? null;
  }

  async update(game: PersistedGame): Promise<void> {
    const games = await this.readAll();
    const index = games.findIndex((g) => g.id === game.id);
    if (index === -1) throw new Error(`no persisted game with id ${game.id}`);
    games[index] = game;
    await this.writeAll(games);
  }

  async listForUser(userId: string, limit: number): Promise<PersistedGame[]> {
    const games = await this.readAll();
    return games
      .filter((g) => g.players.white === userId || g.players.black === userId)
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
}

function toRow(game: PersistedGame) {
  return {
    id: game.id,
    variantId: game.variantId,
    whitePlayerId: game.players.white,
    blackPlayerId: game.players.black,
    opponentType: game.opponentType,
    botTier: game.botTier,
    moveHistory: game.moveHistory as Prisma.InputJsonValue,
    status: game.status,
    resignedBy: game.resignedBy,
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
  moveHistory: Prisma.JsonValue;
  status: string;
  resignedBy: string | null;
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
    moveHistory: row.moveHistory as readonly unknown[],
    status: row.status as 'active' | 'finished',
    resignedBy: row.resignedBy as Player | null,
    tournamentMatch:
      row.tournamentId !== null && row.tournamentRound !== null && row.tournamentIndex !== null
        ? { tournamentId: row.tournamentId, round: row.tournamentRound, index: row.tournamentIndex }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
