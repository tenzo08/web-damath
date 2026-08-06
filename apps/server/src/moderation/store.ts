import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PrismaClient } from '@prisma/client';

export interface Report {
  readonly id: string;
  readonly reporterUserId: string;
  readonly reportedUserId: string;
  readonly reason: string;
  /** The room the report was filed from, if any — null for a context-free report. */
  readonly roomId: string | null;
  readonly createdAt: string;
}

export interface Block {
  readonly id: string;
  readonly blockerUserId: string;
  readonly blockedUserId: string;
  readonly createdAt: string;
}

export interface ModerationStore {
  createReport(report: Report): Promise<void>;
  createBlock(block: Block): Promise<void>;
  removeBlock(blockerUserId: string, blockedUserId: string): Promise<void>;
  listBlocksByUser(blockerUserId: string): Promise<Block[]>;
  /** True if either user has blocked the other — checked before pairing two users for matchmaking (game/rooms.ts). */
  isBlockedEitherWay(userA: string, userB: string): Promise<boolean>;
}

/**
 * Two JSON files, same zero-setup-local-dev scope as every other File*Store in this
 * codebase (KNOWLEDGE.md) — not safe for concurrent writers across processes, fine for
 * a single dev server instance.
 */
export class FileModerationStore implements ModerationStore {
  constructor(
    private readonly reportsPath: string,
    private readonly blocksPath: string,
  ) {}

  private async readAll<T>(path: string): Promise<T[]> {
    try {
      const raw = await readFile(path, 'utf-8');
      return JSON.parse(raw) as T[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async writeAll<T>(path: string, rows: T[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(rows, null, 2), 'utf-8');
  }

  async createReport(report: Report): Promise<void> {
    const reports = await this.readAll<Report>(this.reportsPath);
    reports.push(report);
    await this.writeAll(this.reportsPath, reports);
  }

  async createBlock(block: Block): Promise<void> {
    const blocks = await this.readAll<Block>(this.blocksPath);
    if (blocks.some((b) => b.blockerUserId === block.blockerUserId && b.blockedUserId === block.blockedUserId)) return;
    blocks.push(block);
    await this.writeAll(this.blocksPath, blocks);
  }

  async removeBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
    const blocks = await this.readAll<Block>(this.blocksPath);
    await this.writeAll(
      this.blocksPath,
      blocks.filter((b) => !(b.blockerUserId === blockerUserId && b.blockedUserId === blockedUserId)),
    );
  }

  async listBlocksByUser(blockerUserId: string): Promise<Block[]> {
    const blocks = await this.readAll<Block>(this.blocksPath);
    return blocks.filter((b) => b.blockerUserId === blockerUserId);
  }

  async isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
    const blocks = await this.readAll<Block>(this.blocksPath);
    return blocks.some(
      (b) => (b.blockerUserId === userA && b.blockedUserId === userB) || (b.blockerUserId === userB && b.blockedUserId === userA),
    );
  }
}

/** The real thing — a thin adapter over Prisma's generated `Report`/`Block` models, used whenever `DATABASE_URL` is set (`index.ts`). */
export class PrismaModerationStore implements ModerationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createReport(report: Report): Promise<void> {
    await this.prisma.report.create({
      data: {
        id: report.id,
        reporterUserId: report.reporterUserId,
        reportedUserId: report.reportedUserId,
        reason: report.reason,
        roomId: report.roomId,
        createdAt: new Date(report.createdAt),
      },
    });
  }

  async createBlock(block: Block): Promise<void> {
    await this.prisma.block.upsert({
      where: { blockerUserId_blockedUserId: { blockerUserId: block.blockerUserId, blockedUserId: block.blockedUserId } },
      create: { id: block.id, blockerUserId: block.blockerUserId, blockedUserId: block.blockedUserId, createdAt: new Date(block.createdAt) },
      update: {},
    });
  }

  async removeBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
    await this.prisma.block
      .delete({ where: { blockerUserId_blockedUserId: { blockerUserId, blockedUserId } } })
      .catch(() => {
        // Already removed (or never existed) — deleting a non-existent block is a no-op from the caller's perspective.
      });
  }

  async listBlocksByUser(blockerUserId: string): Promise<Block[]> {
    const rows = await this.prisma.block.findMany({ where: { blockerUserId } });
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async isBlockedEitherWay(userA: string, userB: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerUserId: userA, blockedUserId: userB },
          { blockerUserId: userB, blockedUserId: userA },
        ],
      },
    });
    return count > 0;
  }
}
