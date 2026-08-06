import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PrismaClient } from '@prisma/client';

export interface User {
  readonly id: string;
  /** Always lowercased before storage — lookups never re-normalise. */
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  /** Elo rating — see rating/elo.ts. Every account starts at STARTING_RATING and moves after each online game (human or bot) that actually finishes with a winner or a draw. */
  readonly rating: number;
  /** One of avatars.ts's AVATAR_OPTIONS, or null for the default initial-letter circle. */
  readonly avatarEmoji: string | null;
  readonly createdAt: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
  /** Whole-record replace, same convention as GameStore/TournamentStore's `update` — currently only used to persist a changed `rating`. */
  update(user: User): Promise<void>;
}

/**
 * A JSON file — kept as the zero-setup local-dev fallback (`index.ts` picks this when
 * `DATABASE_URL` is unset) even after the Postgres migration landed, not just a
 * pre-migration relic. Not safe for concurrent writers across processes; fine for a
 * single dev server instance, not fine for production (see KNOWLEDGE.md).
 */
export class FileUserStore implements UserStore {
  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<User[]> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as User[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll(users: User[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(users, null, 2), 'utf-8');
  }

  async findByEmail(email: string): Promise<User | null> {
    const users = await this.readAll();
    return users.find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const users = await this.readAll();
    return users.find((u) => u.id === id) ?? null;
  }

  async create(user: User): Promise<void> {
    const users = await this.readAll();
    users.push(user);
    await this.writeAll(users);
  }

  async update(user: User): Promise<void> {
    const users = await this.readAll();
    const index = users.findIndex((u) => u.id === user.id);
    if (index === -1) throw new Error(`no persisted user with id ${user.id}`);
    users[index] = user;
    await this.writeAll(users);
  }
}

/**
 * The real thing — a thin adapter over Prisma's generated `User` model
 * (`prisma/schema.prisma`), used whenever `DATABASE_URL` is set (`index.ts`). Maps
 * Prisma's `Date` (`createdAt`) to this codebase's `string` (ISO 8601) convention, the
 * same boundary choice `PersistedGame`/`PersistedTournament` already make for their own
 * timestamp fields.
 */
export class PrismaUserStore implements UserStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async create(user: User): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        rating: user.rating,
        avatarEmoji: user.avatarEmoji,
        createdAt: new Date(user.createdAt),
      },
    });
  }

  async update(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        rating: user.rating,
        avatarEmoji: user.avatarEmoji,
      },
    });
  }
}

interface PrismaUserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  createdAt: Date;
}

function toUser(row: PrismaUserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    rating: row.rating,
    avatarEmoji: row.avatarEmoji,
    createdAt: row.createdAt.toISOString(),
  };
}
