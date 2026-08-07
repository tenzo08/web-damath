# Damath

A web platform for **Damath** — the Filipino educational board game combining *dama*
(Filipino checkers) with mathematics, invented by Jesus L. Huenda and played in schools
across the Philippines.

Not a checkers clone with numbers painted on. A tested rules engine, a real minimax AI
opponent, server-authoritative real-time multiplayer, and tournament tooling built for
classroom and DepEd-style competition.

> **v1 archive:** the original Java Swing prototype lives at
> [tenzo08/DaMath](https://github.com/tenzo08/DaMath). This repository is a ground-up
> rewrite with a proper rules engine and real multiplayer.

## Why this exists

Damath is played in elementary and secondary schools nationwide and is a Department of
Education competition game, yet tournaments are still run on paper and the available
digital versions are thin. This aims to be the tool a maths teacher actually uses —
in class, in a competition bracket, or for a student practicing on their own.

## Features

**Play**
- **Play a Friend** — local hot-seat, two players sharing one board, any of the seven
  official variants.
- **Play the Computer** — a real minimax + alpha-beta AI (`packages/ai`), four
  difficulty tiers (Learner / Steady / Sharp / Tournament), runs in a Web Worker so the
  UI never blocks. Works fully offline.
- **Play Online** — real-time, server-validated multiplayer over WebSocket. Matchmaking
  pairs two waiting players on the same variant, or falls back to a bot opponent after a
  timeout so nobody's stuck waiting alone. Full move history, live sound effects, and a
  disconnect-forfeit grace period if a human opponent drops.

**Compete**
- **Tournaments** — teacher-created single-elimination brackets with a join code (built
  to be readable aloud and typed on a phone). Create, join, watch standings even signed
  out, and results **auto-report** the instant a bracket match's game room finishes — no
  manual "who won" click needed. Optional start/end scheduling; live updates push to
  every connected client with no page refresh.
- **Leaderboard** — Elo ratings (K-factor 32), updated after every online game, human or
  bot, with provisional accounts flagged separately.
- **Match History** — every past online game, replayable move by move.
- **Spectate** — watch any in-progress game live, without taking a seat.

**Learn and review**
- **Interactive tutorial** — seven illustrated steps covering the board, moves, mandatory
  and maximal capture, chain captures, scoring, promotion, and winning, each with a
  hand-built board diagram.
- **Post-game AI review** — after any game, every ply is re-evaluated by the same search
  engine that powers the AI opponent and classified (Best / Excellent / Good /
  Inaccuracy / Mistake / Blunder) against the best move actually available at that point.

**Everything else**
- **Accounts** — email/password or Google sign-in, email verification, password reset.
- **Moderation** — report and block other players.
- **Settings** — dark / light / system theme, sound effects with a volume control,
  English/Filipino locale switcher.
- **Installable PWA** — offline-capable; local hot-seat and vs-the-computer play work
  with zero network once the app shell is cached. An optional sideloadable Android APK
  build (Trusted Web Activity) lives in `apps/twa/`.
- **Accessible by default** — full keyboard navigation, ARIA move announcements, visible
  focus rings, `prefers-reduced-motion` respected throughout.

## Architecture

```
packages/engine   Pure TypeScript rules engine. Zero dependencies, zero I/O.
packages/ai       Minimax + alpha-beta opponent. Depends only on the engine.
apps/web          React + Vite client. Renders state; computes no rules.
apps/server       Fastify + WebSocket. Validates every move with the same engine.
apps/twa          Trusted Web Activity config — wraps the deployed PWA as an Android APK.
```

The engine is imported by **both** the browser and the server. The client predicts moves
locally for responsiveness; the server recomputes them for truth. One implementation of
the rules, so the two can never drift.

Games are persisted as **move lists**, not board snapshots — board state is derived by
replaying moves through the engine. This gives replay, spectating, tournament
auto-reporting, and reconnect-by-replay as a property of the design rather than as extra
features bolted on afterward.

## Notable engineering details

- **Variant-generic value types.** Chip values are integers, fractions, rationals,
  radicals, or polynomials depending on the variant. The engine is parameterised over an
  `Arithmetic<V>` interface so `√8 × √18` and `36x²y ÷ 6x` are engine operations, not
  special cases — and the AI opponent, the move ledger, and the post-game review all work
  identically across every variant with no per-variant branching.
- **Faithful competition rules.** Maximal capture, dama-eat-first priority, and the full
  ×1/×2/×4 multiplier table.
- **Server authority.** Clients send intent (`from`, `to`); the server derives legality
  and score with the identical engine call the client used to predict the move. No
  client-supplied score is ever trusted.
- **One WebSocket protocol, several consumers.** Live game moves, spectating, tournament
  broadcasts, and the online-user count all ride the same `/ws` connection machinery.

## Tech stack

| Layer | Stack |
|---|---|
| `packages/engine` | TypeScript, zero runtime dependencies |
| `packages/ai` | TypeScript, depends only on `@damath/engine`, runs in a Web Worker |
| `apps/web` | React 18, Vite, `vite-plugin-pwa` |
| `apps/server` | Fastify, `@fastify/websocket`, `@fastify/jwt`, `@fastify/rate-limit` |
| Persistence | Postgres via Prisma when `DATABASE_URL` is set; JSON files otherwise (zero-setup local dev) |
| Testing | Vitest + `@testing-library/react` across every package |

## Variants

All six official Damath variants are supported as configuration, not forks — Counting
(Grades 1–2), Whole (3–4), Fraction (5–6), Integer (7), Rational (8), Radical (9) and
Polynomial (Fourth Year). They share one board, one operation layout, and one set of
rules; they differ only in what a chip value *is*, which is why the engine and AI are
generic over that value type.

## Getting started

Requires Node ≥22.13 and pnpm (pinned via `packageManager` in `package.json`).

```bash
pnpm install

# fast, isolated feedback loops
pnpm -F @damath/engine test
pnpm -F @damath/ai test

# run the app locally
pnpm -F server dev     # http://localhost:3001
pnpm -F web dev        # http://localhost:5173
```

`apps/server` needs a `JWT_SECRET` to boot — create `apps/server/.env` (loaded
automatically, never committed) with at least:

```bash
JWT_SECRET=some-long-random-string
```

Without `DATABASE_URL` set, the server falls back to local JSON files under
`apps/server/data/` — nothing else to configure for local development. Everything else
is optional, with sane defaults:

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | Signs auth tokens | **required** |
| `DATABASE_URL` | Postgres connection string (Prisma) | unset → JSON file stores |
| `DATA_DIR` | Where the JSON file stores live | `apps/server/data` |
| `CORS_ORIGIN` | Comma-separated allowed origins | reflects any origin |
| `JWT_EXPIRES_IN` | Token lifetime | `30d` |
| `WEB_ORIGIN` | Used to build reset/verify-email links | `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | Enables Google sign-in | unset → Google sign-in disabled |
| `QUEUE_BOT_ENABLED` / `QUEUE_BOT_TIMEOUT_MS` / `QUEUE_BOT_TIER` | Matchmaking bot fallback | `true` / `90000` / `steady` |
| `DISCONNECT_FORFEIT_MS` | Grace period before a dropped human forfeits | `30000` |
| `PORT` | Server port | `3001` |

`apps/web` reads one build-time variable, `VITE_SERVER_URL` (defaults to
`http://localhost:3001`), to point at a non-local server.

## Testing and quality gates

```bash
pnpm test        # every package's test suite
pnpm typecheck   # tsc --noEmit across the workspace, strict, no `any`
pnpm lint        # eslint .
```

`packages/engine` ships with zero runtime dependencies and ≥90% coverage; `packages/ai`
is deterministic under a seed and coverage-tested for search budget compliance,
tactics, and self-play tier ordering.

## License

MIT
