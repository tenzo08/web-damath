import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface User {
  readonly id: string;
  /** Always lowercased before storage — lookups never re-normalise. */
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
}

/**
 * A JSON file, not Postgres+Prisma (PLANNING.md's eventual stack) — this task is scoped
 * to a minimal auth foundation, and a real persistence layer is genuinely Milestone 4/6
 * work once games need it too (see KNOWLEDGE.md). Swapping this for a `UserStore`
 * backed by a real database is a drop-in change; nothing outside this file knows the
 * difference. Not safe for concurrent writers across processes — fine for a single dev
 * server instance, not fine for production.
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
}
