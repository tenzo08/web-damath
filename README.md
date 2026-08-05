# Damath

A web platform for **Damath** — the Filipino educational board game combining *dama*
(Filipino checkers) with mathematics, invented by Jesus L. Huenda and played in schools
across the Philippines.

Not a checkers clone with numbers painted on. A tested rules engine, server-authoritative
multiplayer, and tournament tooling for classroom and DepEd-style competition.

> **v1 archive:** the original Java Swing prototype lives at
> [tenzo08/DaMath](https://github.com/tenzo08/DaMath). This repository is the rewrite —
> see [`docs/LEGACY_AUDIT.md`](docs/LEGACY_AUDIT.md) for what changed and why.

## Why this exists

Damath is played in elementary and secondary schools nationwide and is a Department of
Education competition game, yet tournaments are still run on paper and the available
digital versions are thin. This aims to be the tool a maths teacher actually uses.

## Architecture

```
packages/engine   Pure TypeScript rules engine. Zero dependencies, zero I/O.
packages/ai       Minimax + alpha-beta opponent. Depends only on the engine.
apps/web          React client. Renders state; computes no rules.
apps/server       Node + WebSocket. Validates every move with the same engine.
```

The engine is imported by **both** the browser and the server. The client predicts moves
locally for responsiveness; the server recomputes them for truth. One implementation of
the rules, so the two can never drift.

Games are persisted as **move lists**, not board snapshots — board state is derived by
replaying moves through the engine. This gives replay, anti-cheat verification, and an
audit trail as a property of the design rather than as extra features.

See [`PLANNING.md`](PLANNING.md) and [`docs/adr/`](docs/adr/).

## Notable engineering details

- **Variant-generic value types.** Chip values are integers, rationals, radicals or
  polynomials depending on the variant. The engine is parameterised over an
  `Arithmetic<V>` interface so `√8 × √18` and `36x²y ÷ 6x` are engine operations, not
  special cases.
- **Faithful competition rules.** Maximal capture, dama-eat-first priority, and the full
  ×1/×2/×4 multiplier table, implemented from the official rulebook rather than from
  memory.
- **Server authority.** Clients send intent (`from`, `to`); the server derives legality
  and score. No client-supplied score is ever trusted.
- **Offline-capable.** PWA with local two-player mode, because school connectivity is
  uneven.

## Getting started

```bash
pnpm install
pnpm -F @damath/engine test     # rules engine test suite
pnpm -F @damath/ai test         # AI test suite (search, tactics, self-play)
pnpm -F web dev
pnpm -F server dev
```

## Variants

All six official variants are supported as configuration, not forks — Counting (Grades
1–2), Whole (3–4), Fraction (5–6), Integer (7), Rational (8), Radical (9) and Polynomial
(Fourth Year). They share one board, one operation layout and one set of rules; they
differ only in what a chip value is, which is why the engine is generic over its value
type ([`docs/adr/0002`](docs/adr/0002-variant-value-types.md)).

## Game rules

Full specification in [`docs/DAMATH_RULES.md`](docs/DAMATH_RULES.md), written from the
official DepEd rulebook in [`docs/source/`](docs/source/). Chip layouts in
[`docs/VARIANTS.md`](docs/VARIANTS.md).

## Status

Milestones 1–3 complete: rules engine, local 2-player web UI, and a minimax AI
opponent (four difficulty tiers, playable in-browser via a Web Worker practice mode).
Milestone 4 (authoritative multiplayer server) in progress. See [`TASK.md`](TASK.md).

## License

MIT
