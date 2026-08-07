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
  /** A real uploaded photo, as a size-capped `data:image/...;base64,...` URL (avatars.ts's `isValidAvatarImageDataUrl`), or null. Takes priority over `avatarEmoji` wherever both are set — see the client's `Avatar` component. */
  readonly avatarImage: string | null;
  /** Set once a verify-email token is successfully redeemed. Not currently enforced anywhere (no feature is gated behind it) — just a real, checkable fact about the account. */
  readonly emailVerified: boolean;
  /** SHA-256 of the live token, never the raw token itself (same "never store the redeemable secret" reasoning as a password hash) — see auth/actionTokens.ts. Null when no reset is pending. */
  readonly resetTokenHash: string | null;
  readonly resetTokenExpiresAt: string | null;
  readonly verifyTokenHash: string | null;
  readonly verifyTokenExpiresAt: string | null;
  /** Google's stable per-account `sub` claim, once this account has signed in with Google at least once — null for an account that's only ever used email/password. Every account still has a real `passwordHash` either way (auth/routes.ts's Google-signup completion step collects one same as ordinary signup), so Google is a second way to prove identity, not a replacement for one. */
  readonly googleId: string | null;
  /** How many bot games (docs/AI_OPPONENT.md §9's queue-fallback path) this account has finished — see rating/elo.ts's PLACEMENT_GAMES_REQUIRED. Starts at 0; `rooms.ts`'s `enqueue` routes a still-in-placement account straight to a bot instead of the ordinary human queue, and `updateRatingsIfFinished` increments this and uses the boosted PLACEMENT_K_FACTOR until it reaches the threshold. */
  readonly placementGamesPlayed: number;
  readonly createdAt: string;
}

export interface UserStore {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Case-insensitive -- nicknames must be unique regardless of case (auth/routes.ts). */
  findByDisplayName(displayName: string): Promise<User | null>;
  /** Finds the account already linked to this Google account, if any (auth/routes.ts's /auth/google). */
  findByGoogleId(googleId: string): Promise<User | null>;
  create(user: User): Promise<void>;
  /** Whole-record replace, same convention as GameStore/TournamentStore's `update` — currently only used to persist a changed `rating`. */
  update(user: User): Promise<void>;
  /** Finds the one user (if any) whose `resetTokenHash` matches — see auth/actionTokens.ts. */
  findByResetTokenHash(hash: string): Promise<User | null>;
  /** Finds the one user (if any) whose `verifyTokenHash` matches — see auth/actionTokens.ts. */
  findByVerifyTokenHash(hash: string): Promise<User | null>;
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

  async findByDisplayName(displayName: string): Promise<User | null> {
    const users = await this.readAll();
    const needle = displayName.toLowerCase();
    return users.find((u) => u.displayName.toLowerCase() === needle) ?? null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const users = await this.readAll();
    return users.find((u) => u.googleId === googleId) ?? null;
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

  async findByResetTokenHash(hash: string): Promise<User | null> {
    const users = await this.readAll();
    return users.find((u) => u.resetTokenHash === hash) ?? null;
  }

  async findByVerifyTokenHash(hash: string): Promise<User | null> {
    const users = await this.readAll();
    return users.find((u) => u.verifyTokenHash === hash) ?? null;
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

  async findByDisplayName(displayName: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { displayNameLower: displayName.toLowerCase() } });
    return row ? toUser(row) : null;
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { googleId } });
    return row ? toUser(row) : null;
  }

  async create(user: User): Promise<void> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        displayName: user.displayName,
        displayNameLower: user.displayName.toLowerCase(),
        rating: user.rating,
        avatarEmoji: user.avatarEmoji,
        avatarImage: user.avatarImage,
        emailVerified: user.emailVerified,
        resetTokenHash: user.resetTokenHash,
        resetTokenExpiresAt: user.resetTokenExpiresAt ? new Date(user.resetTokenExpiresAt) : null,
        verifyTokenHash: user.verifyTokenHash,
        verifyTokenExpiresAt: user.verifyTokenExpiresAt ? new Date(user.verifyTokenExpiresAt) : null,
        googleId: user.googleId,
        placementGamesPlayed: user.placementGamesPlayed,
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
        displayNameLower: user.displayName.toLowerCase(),
        rating: user.rating,
        avatarEmoji: user.avatarEmoji,
        avatarImage: user.avatarImage,
        emailVerified: user.emailVerified,
        resetTokenHash: user.resetTokenHash,
        resetTokenExpiresAt: user.resetTokenExpiresAt ? new Date(user.resetTokenExpiresAt) : null,
        verifyTokenHash: user.verifyTokenHash,
        verifyTokenExpiresAt: user.verifyTokenExpiresAt ? new Date(user.verifyTokenExpiresAt) : null,
        googleId: user.googleId,
        placementGamesPlayed: user.placementGamesPlayed,
      },
    });
  }

  async findByResetTokenHash(hash: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { resetTokenHash: hash } });
    return row ? toUser(row) : null;
  }

  async findByVerifyTokenHash(hash: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { verifyTokenHash: hash } });
    return row ? toUser(row) : null;
  }
}

interface PrismaUserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  rating: number;
  avatarEmoji: string | null;
  avatarImage: string | null;
  emailVerified: boolean;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
  verifyTokenHash: string | null;
  verifyTokenExpiresAt: Date | null;
  googleId: string | null;
  placementGamesPlayed: number;
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
    avatarImage: row.avatarImage,
    emailVerified: row.emailVerified,
    resetTokenHash: row.resetTokenHash,
    resetTokenExpiresAt: row.resetTokenExpiresAt ? row.resetTokenExpiresAt.toISOString() : null,
    verifyTokenHash: row.verifyTokenHash,
    verifyTokenExpiresAt: row.verifyTokenExpiresAt ? row.verifyTokenExpiresAt.toISOString() : null,
    googleId: row.googleId,
    placementGamesPlayed: row.placementGamesPlayed,
    createdAt: row.createdAt.toISOString(),
  };
}
