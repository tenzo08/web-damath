import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { VariantId } from '@damath/engine';
import type { Prisma, PrismaClient } from '@prisma/client';
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
  /** ISO 8601 timestamps, both optional — display metadata only, not enforced server-side (joining/starting/reporting a result never checks these). Neither field changes `status`: a tournament past its `endTime` doesn't auto-complete, since Damath's rules don't define what "closing" a tournament mid-bracket should even do to unplayed matches. */
  readonly startTime: string | null;
  readonly endTime: string | null;
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

/** The real thing — a thin adapter over Prisma's generated `Tournament` model (`prisma/schema.prisma`), used whenever `DATABASE_URL` is set (`index.ts`). `participants`/`bracket` stay JSON, same as the file store — see schema.prisma's own comment on why those aren't normalized into relations. */
export class PrismaTournamentStore implements TournamentStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(t: PersistedTournament): Promise<void> {
    await this.prisma.tournament.create({ data: toRow(t) });
  }

  async findById(id: string): Promise<PersistedTournament | null> {
    const row = await this.prisma.tournament.findUnique({ where: { id } });
    return row ? toPersistedTournament(row) : null;
  }

  async findByJoinCode(code: string): Promise<PersistedTournament | null> {
    const row = await this.prisma.tournament.findUnique({ where: { joinCode: code } });
    return row ? toPersistedTournament(row) : null;
  }

  async update(t: PersistedTournament): Promise<void> {
    const { id, ...data } = toRow(t);
    await this.prisma.tournament.update({ where: { id }, data });
  }

  async list(): Promise<readonly PersistedTournament[]> {
    const rows = await this.prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toPersistedTournament);
  }
}

function toRow(t: PersistedTournament) {
  return {
    id: t.id,
    name: t.name,
    variantId: t.variantId,
    creatorUserId: t.creatorUserId,
    joinCode: t.joinCode,
    participants: t.participants as unknown as Prisma.InputJsonValue,
    bracket: t.bracket as unknown as Prisma.InputJsonValue,
    status: t.status,
    startTime: t.startTime ? new Date(t.startTime) : null,
    endTime: t.endTime ? new Date(t.endTime) : null,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

interface PrismaTournamentRow {
  id: string;
  name: string;
  variantId: string;
  creatorUserId: string;
  joinCode: string;
  participants: Prisma.JsonValue;
  bracket: Prisma.JsonValue;
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPersistedTournament(row: PrismaTournamentRow): PersistedTournament {
  return {
    id: row.id,
    name: row.name,
    variantId: row.variantId as VariantId,
    creatorUserId: row.creatorUserId,
    joinCode: row.joinCode,
    participants: row.participants as unknown as readonly string[],
    bracket: row.bracket as unknown as Bracket | null,
    status: row.status as 'lobby' | 'in_progress' | 'complete',
    startTime: row.startTime ? row.startTime.toISOString() : null,
    endTime: row.endTime ? row.endTime.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
