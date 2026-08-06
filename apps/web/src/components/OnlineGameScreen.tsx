import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_VARIANTS, applyMove, createGame, pieceAt, replayMoves } from '@damath/engine';
import type { Move, Position, Variant, VariantId } from '@damath/engine';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { OnlineBoard } from './OnlineBoard';
import { MoveLedger } from './MoveLedger';
import { buildLedgerEntry, type LedgerEntry } from '../lib/ledger';
import { SERVER_HTTP_URL } from '../lib/serverConfig';
import type { PublicGameView } from '../lib/onlineProtocol';
import { useSettings } from '../lib/settings';
import { playCaptureSound, playErrorSound, playLossSound, playMoveSound, playWinSound } from '../lib/sound';

interface OnlineGameScreenProps {
  token: string | null;
  onBackToLobby: () => void;
  onOpenLogin: () => void;
  /** Set when arriving via TournamentScreen's "Play this match" or MatchHistoryScreen's "Replay"/"Resume" — joins that room directly instead of showing the variant picker/matchmaking flow. */
  initialRoomId?: string | undefined;
  /** Only meaningful together with `initialRoomId` — which screen handed off this room, purely for header/back-button copy. Defaults to `'tournament'` so the existing TournamentScreen call site didn't need to change. */
  origin?: 'tournament' | 'history' | undefined;
  /**
   * Fires once when a game reaches `status: 'finished'` (win, loss, or draw) — App.tsx
   * wires this to `useAuth`'s `refreshUser`, since the server updates the player's Elo
   * rating (rating/elo.ts) the instant the game ends, but nothing re-fetches `/auth/me`
   * on its own. Found missing by actually playing a game end-to-end and watching the
   * displayed rating stay stale (KNOWLEDGE.md) — the server-side calculation was
   * correct the whole time, the client just never asked for the new value.
   */
  onGameFinished?: (() => void) | undefined;
}

/**
 * `PublicGameView.moveHistory` is untyped (`unknown[]`) at the wire boundary — the same
 * generic-erasure reason `room.ts`'s own type is. Once `variantId` is known, this is the
 * client-side half of the same JSON-boundary cast `rooms.ts` already relies on
 * server-side, so a completed move (inert historical data, no validation concerns) can
 * be replayed locally with the exact same `applyMove`/`replayMoves` local play uses —
 * to build a moves list and browse earlier positions without the server needing to send
 * a full board snapshot per historical ply.
 */
type ValueOf<T> = T extends Variant<infer V> ? V : never;
type AnyValue = ValueOf<(typeof ALL_VARIANTS)[number]>;

function findVariant(variantId: VariantId): Variant<AnyValue> | null {
  return (ALL_VARIANTS.find((v) => v.id === variantId) as Variant<AnyValue> | undefined) ?? null;
}

function buildOnlineLedger(variant: Variant<AnyValue>, moveHistory: readonly unknown[]): LedgerEntry<AnyValue>[] {
  let before = createGame(variant);
  const entries: LedgerEntry<AnyValue>[] = [];
  for (const move of moveHistory as Move<AnyValue>[]) {
    const mover = pieceAt(before.board, move.from);
    if (!mover) break; // defensive — a move history from the server is always valid, but never throw rendering a moves list
    const after = applyMove(before, move, variant);
    entries.push(buildLedgerEntry(before, mover, move, after, variant));
    before = after;
  }
  return entries;
}

/** The board as it looked after `upTo` played moves — same `{owner, isDama, value}` shape `room.ts`'s own `getView()` sends, so `OnlineBoard` needs no changes to render either a live or a replayed position. */
function replayedWireBoard(variant: Variant<AnyValue>, moveHistory: readonly unknown[], upTo: number): PublicGameView['board'] {
  const replayed = replayMoves(variant, (moveHistory as Move<AnyValue>[]).slice(0, upTo));
  return replayed.board.map((row) =>
    row.map((piece) => (piece ? { owner: piece.owner, isDama: piece.isDama, value: variant.arithmetic.format(piece.value) } : null)),
  );
}

const cardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-card)',
  padding: 'var(--pad-xl)',
} as const;

const primaryButton = {
  background: 'var(--accent)',
  color: 'var(--accent-on)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  fontWeight: 700,
  cursor: 'pointer',
} as const;

const secondaryButton = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  padding: 'var(--pad-sm) var(--pad-lg)',
  cursor: 'pointer',
} as const;

/**
 * "Play Online" — the real apps/server matchmaking flow (docs/AI_OPPONENT.md §9),
 * gracefully degraded when the server isn't reachable rather than erroring out, per
 * the request to showcase the flow even where it can't run in this environment.
 */
export function OnlineGameScreen({ token, onBackToLobby, onOpenLogin, initialRoomId, origin = 'tournament', onGameFinished }: OnlineGameScreenProps) {
  const online = useOnlineGame(token);
  const [variantId, setVariantId] = useState<VariantId>('integer');
  const [selected, setSelected] = useState<Position | null>(null);
  // `null` means "viewing the live position" — same convention `useGame`'s `viewIndex`
  // uses for local play. Browsing history is read-only: it moves the *board* shown, not
  // the live game, so a move made elsewhere while browsing never gets lost or reverted.
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // Deliberately keyed on `token` alone, not `online.connect`/`online.disconnect` — both
  // are re-created every render (they close over `token` themselves), and including them
  // here would tear the socket down and reopen it on every render instead of once per
  // token change.
  useEffect(() => {
    online.connect();
    return () => online.disconnect();
  }, [token]);

  // `online.joinRoom` is stable (useCallback closing only over the stable `send`), so
  // this fires exactly once per connection: the instant `status` reaches 'idle' after
  // `connect()` opens the socket, provided a tournament match handed off a specific room.
  useEffect(() => {
    if (initialRoomId && online.status === 'idle') online.joinRoom(initialRoomId);
  }, [initialRoomId, online.status, online.joinRoom]);

  useEffect(() => setSelected(null), [online.view?.moveCount]);
  // A genuinely new game (a fresh roomId) always starts back at the live position.
  useEffect(() => setViewIndex(null), [online.view?.roomId]);

  const variant = online.view ? findVariant(online.view.variantId) : null;
  const ledger = useMemo(
    () => (online.view && variant ? buildOnlineLedger(variant, online.view.moveHistory) : []),
    [online.view?.moveHistory, variant],
  );
  const isViewingHistory = viewIndex !== null;

  const { effectiveVolume } = useSettings();
  const previousMoveCount = useRef(online.view?.moveCount);
  useEffect(() => {
    const count = online.view?.moveCount;
    if (count !== undefined && previousMoveCount.current !== undefined && count > previousMoveCount.current) {
      const lastEntry = ledger.at(-1);
      if (lastEntry && lastEntry.steps.length > 0) playCaptureSound(effectiveVolume);
      else playMoveSound(effectiveVolume);
    }
    previousMoveCount.current = count;
  }, [online.view?.moveCount, ledger, effectiveVolume]);

  const previousStatus = useRef(online.view?.status);
  useEffect(() => {
    if (online.view?.status === 'finished' && previousStatus.current !== 'finished') {
      if (online.view.winner === null) {
        // A draw — no clear win/loss chime, same "nothing to distinguish" reasoning as
        // hot-seat's single game-over sound, just silence instead here.
      } else if (online.view.winner === online.color) playWinSound(effectiveVolume);
      else playLossSound(effectiveVolume);
      // The server already updated this player's Elo rating by now (rooms.ts awaits it
      // before the "finished" state ever reaches a client) — ask App.tsx to re-fetch
      // /auth/me so the displayed rating actually catches up, win/loss/draw alike.
      onGameFinished?.();
    }
    previousStatus.current = online.view?.status;
  }, [online.view?.status, online.view?.winner, online.color, effectiveVolume, onGameFinished]);

  const previousError = useRef(online.error);
  useEffect(() => {
    if (online.error && online.error !== previousError.current) playErrorSound(effectiveVolume);
    previousError.current = online.error;
  }, [online.error, effectiveVolume]);
  const displayBoard =
    online.view && variant && viewIndex !== null ? replayedWireBoard(variant, online.view.moveHistory, viewIndex) : online.view?.board;

  const historyLength = ledger.length;
  function goToMove(index: number) {
    const clamped = Math.max(0, Math.min(index, historyLength));
    setViewIndex(clamped === historyLength ? null : clamped);
  }
  const stepBack = () => goToMove((viewIndex ?? historyLength) - 1);
  const stepForward = () => goToMove((viewIndex ?? historyLength) + 1);

  function activateSquare(pos: Position) {
    // Board clicks only ever act on the live position — browsing history is view-only,
    // same rule local play's `useGame` enforces (jump back to Live first to move again).
    // Also disabled while reconnecting: the socket that would carry the move isn't open yet.
    if (!online.view || online.color === null || isViewingHistory || online.status !== 'in_game') return;
    const piece = online.view.board[pos.row]?.[pos.col] ?? null;
    if (selected) {
      if (piece && piece.owner === online.color) {
        setSelected(pos);
        return;
      }
      online.move(selected, pos);
      setSelected(null);
      return;
    }
    if (piece && piece.owner === online.color) setSelected(pos);
  }

  return (
    <main style={{ flex: 1, padding: 'var(--pad-xl)', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
          <button type="button" onClick={onBackToLobby} style={secondaryButton}>
            ← {initialRoomId ? (origin === 'history' ? 'History' : 'Tournament') : 'Lobby'}
          </button>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>
            {initialRoomId ? (origin === 'history' ? 'Match Replay' : 'Tournament Match') : 'Play Online'}
          </h1>
        </header>

        {!token && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-md) 0', color: 'var(--text-secondary)' }}>
              Sign in to find a real opponent — the server pairs you with another signed-in player, or a computer
              opponent if no one's waiting.
            </p>
            <button type="button" onClick={onOpenLogin} style={primaryButton}>
              Sign in
            </button>
          </div>
        )}

        {token && online.status === 'connecting' && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Connecting to {SERVER_HTTP_URL}…</p>
          </div>
        )}

        {token && online.status === 'unreachable' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-sm) 0', color: 'var(--danger)' }}>{online.error ?? "Can't reach the multiplayer server."}</p>
            <p style={{ margin: '0 0 var(--pad-lg) 0', fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
              This is what the flow looks like once <code>apps/server</code> is running (<code>pnpm -F server dev</code>): pick a
              variant, find a match, and the server pairs you with another player or, after a short wait, a labelled
              computer opponent — never silently.
            </p>
            <div style={{ display: 'flex', gap: 'var(--gap-sm)', opacity: 0.5, pointerEvents: 'none', marginBottom: 'var(--pad-lg)' }}>
              <select disabled style={{ ...secondaryButton, cursor: 'default' }}>
                <option>Integer Damath</option>
              </select>
              <button type="button" disabled style={primaryButton}>
                Find match
              </button>
            </div>
            <button type="button" onClick={online.connect} style={secondaryButton}>
              Try again
            </button>
          </div>
        )}

        {token && online.status === 'idle' && initialRoomId && (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Joining the match…</p>
          </div>
        )}

        {token && online.status === 'idle' && !initialRoomId && (
          <div style={cardStyle}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', maxWidth: 320 }}>
              <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Variant</span>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value as VariantId)} style={{ ...secondaryButton, cursor: 'pointer' }}>
                {ALL_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gradeLevel})
                  </option>
                ))}
              </select>
            </label>
            <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-muted)', margin: 'var(--pad-sm) 0 var(--pad-lg) 0' }}>
              Pairing you with a player. If none is available we'll match you with the computer.
            </p>
            <button type="button" onClick={() => online.queue(variantId)} style={primaryButton}>
              Find match
            </button>
          </div>
        )}

        {online.status === 'queued' && (
          <div style={cardStyle}>
            <p style={{ margin: '0 0 var(--pad-lg) 0', color: 'var(--text-secondary)' }}>Waiting for an opponent…</p>
            <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
              <button type="button" onClick={online.declineBot} style={secondaryButton}>
                Keep waiting for a human
              </button>
              <button type="button" onClick={online.cancelQueue} style={secondaryButton}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {(online.status === 'in_game' || online.status === 'reconnecting') && online.view && (
          <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
            {online.status === 'reconnecting' && (
              <div
                role="status"
                style={{
                  width: '100%',
                  background: 'var(--surface-panel)',
                  border: '1px solid var(--warning, var(--border))',
                  borderRadius: 'var(--radius-card)',
                  padding: 'var(--pad-sm) var(--pad-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--fs-meta)',
                }}
              >
                Connection lost — reconnecting to the match…
              </div>
            )}
            <div style={{ flex: '3 1 480px', maxWidth: 760, minWidth: 280, width: '100%' }}>
              <OnlineBoard
                view={displayBoard ? { ...online.view, board: displayBoard } : online.view}
                selected={selected}
                myColor={online.color}
                onActivateSquare={activateSquare}
              />
            </div>
            <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
              <div style={cardStyle}>
                <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                  You're {online.color === 'white' ? 'Light' : 'Dark'} ·{' '}
                  {online.view.opponentType === 'bot' ? `vs Computer (${online.view.botTier ?? '?'})` : 'vs a player'}
                </p>
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-label)' }}>
                  Light {online.view.scores.white} — Dark {online.view.scores.black}
                </p>
                <p style={{ margin: 'var(--pad-sm) 0 0 0', fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                  {online.view.status === 'finished'
                    ? online.view.resignedBy
                      ? `${online.view.resignedBy === 'white' ? 'Light' : 'Dark'} resigned — ${online.view.winner === 'white' ? 'Light' : 'Dark'} wins.`
                      : online.view.winner
                        ? `Game over — ${online.view.winner === 'white' ? 'Light' : 'Dark'} wins.`
                        : 'Game over — draw.'
                    : `${online.view.turn === 'white' ? 'Light' : 'Dark'} to move`}
                </p>
              </div>
              {/* Back/forward history browsing — deliberately not an undo control. Online
                  games are server-authoritative; a player can look at any earlier position
                  but can't retract a move that's already landed. */}
              <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
                <button type="button" onClick={stepBack} disabled={(viewIndex ?? historyLength) <= 0} style={secondaryButton}>
                  ◂ Back
                </button>
                <button type="button" onClick={stepForward} disabled={!isViewingHistory} style={secondaryButton}>
                  Forward ▸
                </button>
              </div>
              {online.view.status !== 'finished' && (
                <button
                  type="button"
                  onClick={online.resign}
                  disabled={isViewingHistory || online.status !== 'in_game'}
                  style={{ ...secondaryButton, color: 'var(--danger)' }}
                >
                  Resign
                </button>
              )}
              {online.error && (
                <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                  {online.error}
                </p>
              )}
            </div>

            <div style={{ flex: '1 1 260px', maxWidth: 320, minWidth: 220, display: 'flex', flexDirection: 'column' }}>
              <MoveLedger entries={ledger} format={(v) => (variant ? variant.arithmetic.format(v) : String(v))} viewIndex={viewIndex} onSelectMove={goToMove} onExitReplay={() => setViewIndex(null)} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
