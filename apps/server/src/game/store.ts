import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Player, VariantId } from '@damath/engine';

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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GameStore {
  create(game: PersistedGame): Promise<void>;
  findById(id: string): Promise<PersistedGame | null>;
  /** Replaces one game's `moveHistory`/`status`/`updatedAt` after a validated move — never partial-patches, always the whole persisted record. */
  update(game: PersistedGame): Promise<void>;
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
}
