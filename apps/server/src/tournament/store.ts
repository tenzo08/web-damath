import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VariantId } from '@damath/engine';
import type { Bracket } from './bracket.js';

export interface PersistedTournament {
  readonly id: string;
  readonly name: string;
  readonly variantId: VariantId;
  readonly creatorUserId: string;
  readonly joinCode: string;
  /** User ids, in join order — the creator is always participants[0]. */
  readonly participants: readonly string[];
  readonly bracket: Bracket | null;
  readonly status: 'lobby' | 'in_progress' | 'complete';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TournamentStore {
  create(t: PersistedTournament): Promise<void>;
  findById(id: string): Promise<PersistedTournament | null>;
  findByJoinCode(code: string): Promise<PersistedTournament | null>;
  update(t: PersistedTournament): Promise<void>;
  list(): Promise<readonly PersistedTournament[]>;
}

/** Same scope decision as `FileUserStore`/`FileGameStore` — see KNOWLEDGE.md. */
export class FileTournamentStore implements TournamentStore {
  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<PersistedTournament[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as PersistedTournament[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(tournaments: PersistedTournament[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(tournaments, null, 2), 'utf-8');
  }

  async create(t: PersistedTournament): Promise<void> {
    const all = await this.readAll();
    all.push(t);
    await this.writeAll(all);
  }

  async findById(id: string): Promise<PersistedTournament | null> {
    const all = await this.readAll();
    return all.find((t) => t.id === id) ?? null;
  }

  async findByJoinCode(code: string): Promise<PersistedTournament | null> {
    const all = await this.readAll();
    return all.find((t) => t.joinCode === code) ?? null;
  }

  async update(t: PersistedTournament): Promise<void> {
    const all = await this.readAll();
    const index = all.findIndex((x) => x.id === t.id);
    if (index === -1) throw new Error(`no persisted tournament with id ${t.id}`);
    all[index] = t;
    await this.writeAll(all);
  }

  async list(): Promise<readonly PersistedTournament[]> {
    return this.readAll();
  }
}
