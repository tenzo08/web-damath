import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_VARIANTS, applyMove, createGame, legalMoves, pieceAt, replayMoves } from '@damath/engine';
import type { Move, Player, Position, Variant, VariantId } from '@damath/engine';
import { positionKey, samePosition } from '../lib/board';
import { useMediaQuery, NARROW_QUERY } from '../hooks/useMediaQuery';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { OnlineBoard } from './OnlineBoard';
import { MoveLedger } from './MoveLedger';
import { PlayerCard } from './PlayerCard';
import { Rail } from './Rail';
import { ReportBlockButtons } from './ReportBlockButtons';
import { buildLedgerEntry, type LedgerEntry } from '../lib/ledger';
import { playerLabel } from '../lib/notation';
import { SERVER_HTTP_URL } from '../lib/serverConfig';
import type { PublicGameView } from '../lib/onlineProtocol';
import { useSettings } from '../lib/settings';
import { playCaptureSound, playErrorSound, playLossSound, playMoveSound, playWinSound } from '../lib/sound';
import { CONFETTI_PIECES } from '../lib/confetti';
import type { AuthUser } from '../lib/authClient';
import { fetchUserProfile, type PublicUserProfile } from '../lib/userProfileClient';

interface OnlineGameScreenProps {
  token: string | null;
  /** `null` while signed out. While still inside its placement window (placementGamesPlayed < placementGamesRequired), "Find match" routes straight to a bot game instead of waiting for a human — this is only used to explain that in the matchmaking screen's own copy. */
  user: AuthUser | null;
  onBackToLobby: () => void;
  onOpenLogin: () => void;
  /** Wired to the same `Rail` "How to play" button local play's `GameShell` uses — one tutorial modal, opened from whichever screen is currently playing. */
  onOpenTutorial: () => void;
  /** Set when arriving via TournamentScreen's "Play this match" or MatchHistoryScreen's "Replay"/"Resume" — joins that room directly instead of showing the variant picker/matchmaking flow. */
  initialRoomId?: string | undefined;
  /** Only meaningful together with `initialRoomId` — which screen handed off this room, purely for header/back-button copy. Defaults to `'tournament'` so the existing TournamentScreen call site didn't need to change. */
  origin?: 'tournament' | 'history' | 'spectate' | undefined;
  /** Opens GameReviewScreen for this room's variant/move history — App.tsx owns the actual screen switch, this just hands over what to review. */
  onReviewGame: (variantId: VariantId, moveHistory: readonly unknown[]) => void;
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
    row.map((piece) => (piece ? { id: piece.id, owner: piece.owner, isDama: piece.isDama, value: variant.arithmetic.format(piece.value) } : null)),
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
export function OnlineGameScreen({
  token,
  user,
  onBackToLobby,
  onOpenLogin,
  onOpenTutorial,
  initialRoomId,
  origin = 'tournament',
  onReviewGame,
  onGameFinished,
}: OnlineGameScreenProps) {
  const online = useOnlineGame(token);
  // Same breakpoint Rail itself renders around — the "back to lobby" button below is
  // full-width to match the wide sidebar's other buttons there, but forcing that same
  // width in the narrow top bar wraps it onto its own oversized line (Rail.tsx's own
  // doc comment has the fuller story).
  const narrow = useMediaQuery(NARROW_QUERY);
  const [variantId, setVariantId] = useState<VariantId>('integer');
  const [selected, setSelected] = useState<Position | null>(null);
  // `null` means "viewing the live position" — same convention `useGame`'s `viewIndex`
  // uses for local play. Browsing history is read-only: it moves the *board* shown, not
  // the live game, so a move made elsewhere while browsing never gets lost or reverted.
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  // The move the local player just clicked, applied instantly client-side while the
  // server round-trip is still in flight — otherwise the mover's own piece only moves
  // once the `state` broadcast comes back, which reads as a perceptible delay compared
  // to local play's instant feedback (found by tracing the click -> `online.move` ->
  // WS round-trip -> `state` path: there was no optimistic step anywhere in it). Still
  // fully server-authoritative: this is pure display prediction, cleared the moment the
  // real `state` catches up (`moveCount` advances) or the move is rejected (`error`)
  // below, same "client-side prediction is a UX nicety, server state is truth" rule
  // CLAUDE.md's absolute rules already require. Keyed to the live `moveCount` at the
  // moment it was sent so a stale prediction from an earlier ply is never reapplied.
  const [pendingMove, setPendingMove] = useState<{ from: Position; to: Position; moveCount: number } | null>(null);
  // Human opponents' real display name/rating (server room state only ever carries a
  // user id — room.ts's `getView()` doc comment) — keyed by user id so both a live
  // player's opponent and a spectator's two watched players resolve independently.
  // `requestedProfileIdsRef` is a dedupe set, separate from the `profiles` state itself,
  // so the fetch effect below doesn't need `profiles` in its own dependency array (which
  // would re-run it, harmlessly but pointlessly, on every fetch it just completed).
  const [profiles, setProfiles] = useState<Record<string, PublicUserProfile | null>>({});
  const requestedProfileIdsRef = useRef<Set<string>>(new Set());

  // Deliberately keyed on `token` alone, not `online.connect`/`online.disconnect` — both
  // are re-created every render (they close over `token` themselves), and including them
  // here would tear the socket down and reopen it on every render instead of once per
  // token change.
  useEffect(() => {
    online.connect();
    return () => online.disconnect();
  }, [token]);

  // `online.joinRoom`/`online.spectate` are stable (useCallback closing only over the
  // stable `send`), so this fires exactly once per connection: the instant `status`
  // reaches 'idle' after `connect()` opens the socket, provided a tournament match,
  // match-history entry, or spectate pick handed off a specific room. `spectate` never
  // claims a seat, even if one happens to be open — `join_room` would, which is wrong
  // for a genuine third-party spectator.
  useEffect(() => {
    if (!initialRoomId || online.status !== 'idle') return;
    if (origin === 'spectate') online.spectate(initialRoomId);
    else online.joinRoom(initialRoomId);
  }, [initialRoomId, origin, online.status, online.joinRoom, online.spectate]);

  useEffect(() => setSelected(null), [online.view?.moveCount]);
  // A genuinely new game (a fresh roomId) always starts back at the live position.
  useEffect(() => setViewIndex(null), [online.view?.roomId]);
  useEffect(() => setPendingMove(null), [online.view?.roomId]);
  // The real state has caught up with (or overtaken) the prediction -- drop it so the
  // server's own broadcast, not the guess, drives the board from here on.
  useEffect(() => {
    if (pendingMove && online.view && online.view.moveCount > pendingMove.moveCount) setPendingMove(null);
  }, [online.view?.moveCount, pendingMove]);
  // The move was rejected (illegal, not your turn, game already over, ...) -- the
  // server never broadcasts a `state` for a rejected move, only this `error`, so this
  // is the only signal that tells the prediction to roll back.
  useEffect(() => {
    if (online.error) setPendingMove(null);
  }, [online.error]);

  const variant = online.view ? findVariant(online.view.variantId) : null;

  // Fetches once per user id and caches for the component's lifetime -- re-runs only
  // when the seated players actually change (a fresh room), not on every `state`
  // broadcast a move produces.
  useEffect(() => {
    if (!token || !online.view) return undefined;
    const ids = [online.view.players.white, online.view.players.black].filter(
      (id): id is string => id !== null && !requestedProfileIdsRef.current.has(id),
    );
    if (ids.length === 0) return undefined;
    for (const id of ids) requestedProfileIdsRef.current.add(id);
    let cancelled = false;
    void Promise.all(ids.map(async (id) => [id, await fetchUserProfile(token, id)] as const)).then((results) => {
      if (cancelled) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const [id, profile] of results) next[id] = profile;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [token, online.view?.players.white, online.view?.players.black]);
  // The other seat's user id, from a real player's own point of view -- `null` for a
  // spectator (no single "opponent" to name) or an unseated color.
  const opponentUserId =
    online.view && online.color ? online.view.players[online.color === 'white' ? 'black' : 'white'] : null;
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

  // The "opponent found" transition (chess.com's own convention) — shown only for a
  // genuine fresh pairing straight out of the matchmaking queue (`'queued' -> 'in_game'`
  // via the `matched` message), never for rejoining an existing room from history,
  // a tournament, spectating, or an automatic reconnect after a dropped connection —
  // none of those are "the game really starting."
  const [showMatchIntro, setShowMatchIntro] = useState(false);
  const previousConnectionStatus = useRef(online.status);
  useEffect(() => {
    const wasQueued = previousConnectionStatus.current === 'queued';
    previousConnectionStatus.current = online.status;
    if (!wasQueued || online.status !== 'in_game') return undefined;
    setShowMatchIntro(true);
    const timer = setTimeout(() => setShowMatchIntro(false), 1800);
    return () => clearTimeout(timer);
  }, [online.status]);

  // Applies the pending move to the live position purely for display -- the server's
  // own reply either confirms it (the "moveCount caught up" effect above then drops the
  // prediction) or rejects it (the `error` effect drops it instead). Never consulted
  // while browsing history (`viewIndex !== null`), which already shows a fully replayed
  // board below and never has a pending move of its own.
  const optimisticState = useMemo(() => {
    if (!pendingMove || !online.view || !variant || viewIndex !== null) return null;
    if (online.view.moveCount !== pendingMove.moveCount) return null;
    const liveState = replayMoves(variant, online.view.moveHistory as Move<AnyValue>[]);
    const match = legalMoves(liveState).find((m) => samePosition(m.from, pendingMove.from) && samePosition(m.to, pendingMove.to));
    if (!match) return null;
    return applyMove(liveState, match, variant, { checkGameOver: false });
  }, [pendingMove, online.view, variant, viewIndex]);

  const displayBoard =
    online.view && variant && viewIndex !== null
      ? replayedWireBoard(variant, online.view.moveHistory, viewIndex)
      : optimisticState && variant
        ? optimisticState.board.map((row) =>
            row.map((piece) =>
              piece ? { id: piece.id, owner: piece.owner, isDama: piece.isDama, value: variant.arithmetic.format(piece.value) } : null,
            ),
          )
        : online.view?.board;

  // Handed to `OnlineBoard`/`playerCardFor` in place of `online.view` while a move is
  // in-flight -- board *and* turn flip together so the "to move" badge feels as
  // responsive as the piece itself, not one beat behind it.
  const effectiveView: PublicGameView | null =
    online.view && displayBoard ? { ...online.view, board: displayBoard, turn: optimisticState ? optimisticState.turn : online.view.turn } : online.view;

  // Squares holding a piece the seated player can legally move right now -- empty for a
  // spectator, off-turn, mid-history-browse, or a finished game, same conditions
  // `activateSquare` below already gates real clicks on.
  const legalFrom = useMemo(() => {
    if (!online.view || !variant || online.color === null || isViewingHistory) return new Set<string>();
    if (online.view.turn !== online.color || online.view.status === 'finished') return new Set<string>();
    const liveState = replayMoves(variant, online.view.moveHistory as Move<AnyValue>[]);
    return new Set(legalMoves(liveState).map((m) => positionKey(m.from)));
  }, [online.view, variant, online.color, isViewingHistory]);

  // Every legal move from the currently selected piece -- "show all the cells where it
  // can move," same computation `legalFrom` above already does for "which pieces have
  // some legal move," just filtered down to one piece and keeping the whole `Move`
  // (not just its `from`) so OnlineBoard can also tell a chain capture's intermediate
  // landing squares apart from its final destination.
  const destinations = useMemo(() => {
    if (!online.view || !variant || !selected || isViewingHistory) return [];
    if (online.view.turn !== online.color || online.view.status === 'finished') return [];
    const liveState = replayMoves(variant, online.view.moveHistory as Move<AnyValue>[]);
    return legalMoves(liveState).filter((m) => samePosition(m.from, selected));
  }, [online.view, variant, selected, online.color, isViewingHistory]);

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
    // Also disabled while reconnecting: the socket that would carry the move isn't open
    // yet, and while a previous move is still in flight (`pendingMove`) -- the server
    // hasn't confirmed it, so `online.view` doesn't reflect it yet either, and a second
    // click before then would race the first move's own optimistic prediction.
    if (!online.view || online.color === null || isViewingHistory || online.status !== 'in_game' || pendingMove) return;
    const piece = online.view.board[pos.row]?.[pos.col] ?? null;
    if (selected) {
      if (piece && piece.owner === online.color) {
        setSelected(pos);
        return;
      }
      online.move(selected, pos);
      setPendingMove({ from: selected, to: pos, moveCount: online.view.moveCount });
      setSelected(null);
      return;
    }
    if (piece && piece.owner === online.color) setSelected(pos);
  }

  // Same chess.com convention local play's GameShellView uses: your own seat is always
  // the bottom card, mirroring OnlineBoard's own `flipped = myColor === 'black'` — a
  // spectator (myColor === null) falls back to the same not-flipped default the board does.
  const flipped = online.color === 'black';
  const topColor: Player = flipped ? 'white' : 'black';
  const bottomColor: Player = flipped ? 'black' : 'white';

  // Shared by `playerCardFor` (which also needs the raw `profile` for avatar/rating)
  // and the finished-game announcement text below, which used to hardcode "Light"/
  // "Dark" instead of a real name for either side.
  function nameFor(side: Player, view: PublicGameView): string {
    const isMe = online.color === side;
    if (isMe) return user?.displayName ?? playerLabel(side);
    if (view.opponentType === 'bot') return view.botNickname ?? 'Unknown';
    const seatUserId = view.players[side];
    const profile = seatUserId ? (profiles[seatUserId] ?? null) : null;
    return profile?.displayName ?? playerLabel(side);
  }

  function playerCardFor(side: Player, view: PublicGameView) {
    const isMe = online.color === side;
    // A human opponent's real rating comes from `profiles` (fetched via the new
    // `GET /users/:id`, keyed by `view.players[side]`) -- bot games never reach that
    // fetch with a resolvable id (the bot's seat holds the literal 'bot' placeholder,
    // which 404s harmlessly and just leaves `profile` undefined).
    const seatUserId = view.players[side];
    const profile = !isMe && seatUserId ? (profiles[seatUserId] ?? null) : null;
    const label = nameFor(side, view);
    return (
      <PlayerCard
        side={side}
        label={label}
        avatarEmoji={isMe ? (user?.avatarEmoji ?? null) : (profile?.avatarEmoji ?? null)}
        avatarImage={isMe ? (user?.avatarImage ?? null) : (profile?.avatarImage ?? null)}
        rating={isMe ? (user?.rating ?? null) : (profile?.rating ?? null)}
        score={view.scores[side]}
        isTurn={view.status !== 'finished' && view.turn === side}
      />
    );
  }

  const backLabel = initialRoomId ? (origin === 'history' ? 'History' : origin === 'spectate' ? 'Spectate' : 'Tournament') : 'Lobby';
  const titleText = initialRoomId
    ? origin === 'history'
      ? 'Match Replay'
      : origin === 'spectate'
        ? 'Spectating'
        : 'Tournament Match'
    : 'Play Online';

  return (
    <>
      <Rail
        onOpenTutorial={onOpenTutorial}
        menuButton={
          <button
            type="button"
            onClick={onBackToLobby}
            style={{
              width: narrow ? undefined : '100%',
              background: 'var(--accent)',
              color: 'var(--accent-on)',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: 'var(--pad-sm) var(--pad-md)',
              fontSize: 'var(--fs-label)',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ← {backLabel}
          </button>
        }
      />
      <main style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0, padding: 'var(--pad-lg)', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-md)' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--fs-title)' }}>{titleText}</h1>
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
                {user && user.placementGamesPlayed < user.placementGamesRequired
                  ? `New accounts play ${String(user.placementGamesRequired - user.placementGamesPlayed)} more game(s) against the computer first, so ratings start from a real level (${String(user.placementGamesPlayed)}/${String(user.placementGamesRequired)} played).`
                  : "Pairing you with a player. If none is available we'll match you with the computer."}
              </p>
              <button type="button" onClick={() => online.queue(variantId)} style={primaryButton}>
                Find match
              </button>
            </div>
          )}

          {online.status === 'queued' && (
            <div style={cardStyle}>
              <p style={{ margin: '0 0 var(--pad-lg) 0', color: 'var(--text-secondary)' }}>Waiting for an opponent…</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-sm)' }}>
                <button type="button" onClick={online.declineBot} style={{ ...secondaryButton, width: '100%' }}>
                  Keep waiting for a human
                </button>
                <button type="button" onClick={online.cancelQueue} style={{ ...secondaryButton, width: '100%' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showMatchIntro && online.view && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--pad-xl) 0' }}>
              <div
                className="match-intro-card"
                style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', alignItems: 'center', minWidth: 280 }}
              >
                <p style={{ margin: 0, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  Opponent found
                </p>
                <div className="match-intro-side" style={{ width: '100%' }}>
                  {playerCardFor(topColor, online.view)}
                </div>
                <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>vs</span>
                <div className="match-intro-side" style={{ width: '100%' }}>
                  {playerCardFor(bottomColor, online.view)}
                </div>
                <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>Game starting…</p>
              </div>
            </div>
          )}

          {!showMatchIntro && (online.status === 'in_game' || online.status === 'reconnecting') && online.view && (
            <div style={{ display: 'flex', gap: 'var(--gap-lg)', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center', minHeight: 0 }}>
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
              {online.color === null && (
                <p style={{ width: '100%', margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>Spectating</p>
              )}

              {/* Board on the left at a smaller scale, controls and the moves list in a
                  column to its right — same arrangement as local play's GameShellView.
                  Below the wrap breakpoint the row wraps and the controls column drops
                  beneath the board instead of beside it. */}
              <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
                {playerCardFor(topColor, effectiveView ?? online.view)}
                <OnlineBoard
                  view={effectiveView ?? online.view}
                  selected={selected}
                  myColor={online.color}
                  legalFrom={legalFrom}
                  destinations={destinations}
                  onActivateSquare={activateSquare}
                />
                {playerCardFor(bottomColor, effectiveView ?? online.view)}
              </div>

              <div style={{ flex: '1 1 260px', maxWidth: 320, minWidth: 220, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
                {online.view.status === 'finished' && (
                  <div style={{ ...cardStyle, position: 'relative' }}>
                    {online.view.winner &&
                      CONFETTI_PIECES.map((piece, i) => (
                        <span key={i} className="confetti-piece" style={{ left: piece.left, animationDelay: piece.delay, background: piece.color }} />
                      ))}
                    <p className={online.view.winner ? 'winner-announcement' : undefined} style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
                      {online.disconnectForfeitedBy
                        ? `${nameFor(online.disconnectForfeitedBy, online.view)} disconnected — ${online.view.winner ? nameFor(online.view.winner, online.view) : ''} wins.`
                        : online.view.resignedBy
                          ? `${nameFor(online.view.resignedBy, online.view)} resigned — ${online.view.winner ? nameFor(online.view.winner, online.view) : ''} wins.`
                          : online.view.drawnByAgreement
                            ? 'Draw by agreement.'
                            : online.view.winner
                              ? `Game over — ${nameFor(online.view.winner, online.view)} wins.`
                              : 'Game over — draw.'}
                    </p>
                    {/* A full-width vertical stack, primary action first -- the same
                        convention GameOverModal uses for local play's own end-of-game
                        actions, not an ad-hoc wrapping row. Three buttons of visibly
                        different label lengths in a `flex-wrap` row reflow
                        unpredictably at phone widths (one alone on its own short line,
                        or an awkward two-plus-one split) instead of reading as one
                        deliberate group. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)', marginTop: 'var(--pad-md)' }}>
                      <button type="button" onClick={() => online.queue(online.view?.variantId ?? variantId)} style={{ ...primaryButton, width: '100%' }}>
                        Find another match
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (online.view) onReviewGame(online.view.variantId, online.view.moveHistory);
                        }}
                        style={{ ...secondaryButton, width: '100%' }}
                      >
                        🔍 Review game
                      </button>
                      <button type="button" onClick={onBackToLobby} style={{ ...secondaryButton, width: '100%' }}>
                        Back to Lobby
                      </button>
                    </div>
                  </div>
                )}
                {/* Back/forward history browsing — deliberately not an undo control. Online
                    games are server-authoritative; a player can look at any earlier position
                    but can't retract a move that's already landed. */}
                {/* A grid, not flex — guarantees the two columns stay exactly equal
                    width regardless of the label lengths, same convention local play's
                    GameControls.tsx uses for its own Back/Forward pair. */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-sm)' }}>
                  <button type="button" onClick={stepBack} disabled={(viewIndex ?? historyLength) <= 0} style={{ ...secondaryButton, width: '100%' }}>
                    ◂ Back
                  </button>
                  <button type="button" onClick={stepForward} disabled={!isViewingHistory} style={{ ...secondaryButton, width: '100%' }}>
                    Forward ▸
                  </button>
                </div>
                {/* A spectator (online.color === null) never sees any of these — there's
                    nothing for them to offer, accept, decline, or resign. */}
                {online.color !== null && online.view.status !== 'finished' && online.view.drawOfferedBy && online.view.drawOfferedBy !== online.color && (
                  <div style={{ ...cardStyle, padding: 'var(--pad-md)', border: '1px solid var(--accent)' }}>
                    <p style={{ margin: '0 0 var(--pad-sm) 0', fontSize: 'var(--fs-meta)' }}>Your opponent offered a draw.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-sm)' }}>
                      <button type="button" onClick={() => online.respondDraw(true)} style={{ ...primaryButton, width: '100%' }}>
                        Accept
                      </button>
                      <button type="button" onClick={() => online.respondDraw(false)} style={{ ...secondaryButton, width: '100%' }}>
                        Decline
                      </button>
                    </div>
                  </div>
                )}
                {online.color !== null && online.view.status !== 'finished' && online.view.drawOfferedBy === online.color && (
                  <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
                    Draw offer sent — waiting for your opponent…
                  </p>
                )}
                {online.color !== null && online.view.status !== 'finished' && (
                  // A bot game never shows "Offer Draw" (room.ts rejects it outright),
                  // so Resign is the only button here -- a lone half-width grid cell
                  // would look like a mistake, not a deliberate single action, so the
                  // grid only appears once there's a real pair to align.
                  <div style={online.view.opponentType === 'human' ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-sm)' } : undefined}>
                    {online.view.opponentType === 'human' && (
                      <button
                        type="button"
                        onClick={online.offerDraw}
                        disabled={isViewingHistory || online.status !== 'in_game' || online.view.drawOfferedBy !== null}
                        style={{ ...secondaryButton, width: '100%' }}
                      >
                        Offer Draw
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={online.resign}
                      disabled={isViewingHistory || online.status !== 'in_game'}
                      style={{ ...secondaryButton, color: 'var(--danger)', width: '100%' }}
                    >
                      Resign
                    </button>
                  </div>
                )}
                {online.error && (
                  <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--danger)' }}>
                    {online.error}
                  </p>
                )}
                {/* Only a real player reporting their real opponent -- not a spectator
                    reporting either player, and never against the computer opponent,
                    which has no account to report or block. */}
                {token && online.color !== null && online.view.opponentType === 'human' && opponentUserId && (
                  <ReportBlockButtons token={token} targetUserId={opponentUserId} targetName="your opponent" roomId={online.view.roomId} />
                )}
                {/* The one section that's meant to scroll internally, per request — a
                    fixed max-height (MoveLedger.tsx) and a hidden scrollbar (.scroll-hidden). */}
                <MoveLedger entries={ledger} format={(v) => (variant ? variant.arithmetic.format(v) : String(v))} viewIndex={viewIndex} onSelectMove={goToMove} onExitReplay={() => setViewIndex(null)} />
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
