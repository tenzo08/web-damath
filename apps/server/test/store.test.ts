import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileUserStore, type User } from '../src/auth/store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'damath-server-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'teacher@example.com',
    passwordHash: 'salt:hash',
    displayName: 'Ms. Cruz',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FileUserStore', () => {
  it('returns null for lookups against an empty (not-yet-created) file', async () => {
    const store = new FileUserStore(path.join(dir, 'users.json'));
    expect(await store.findByEmail('nobody@example.com')).toBeNull();
    expect(await store.findById('nobody')).toBeNull();
  });

  it('creates a user and finds it by email and id', async () => {
    const store = new FileUserStore(path.join(dir, 'users.json'));
    const user = makeUser();
    await store.create(user);

    expect(await store.findByEmail('teacher@example.com')).toEqual(user);
    expect(await store.findById('user-1')).toEqual(user);
  });

  it('persists across separate store instances pointed at the same file', async () => {
    const filePath = path.join(dir, 'users.json');
    await new FileUserStore(filePath).create(makeUser());

    const reopened = new FileUserStore(filePath);
    expect(await reopened.findByEmail('teacher@example.com')).not.toBeNull();
  });
});
