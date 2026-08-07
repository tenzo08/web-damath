import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_VARIANTS, legalMoves } from '@damath/engine';
import type { AnyVariant, Player, Variant, VariantId } from '@damath/engine';
import type { DifficultyTier } from '@damath/ai';
import { useGame } from './hooks/useGame';
import { useComputerOpponent } from './hooks/useComputerOpponent';
import { useGameClock } from './hooks/useGameClock';
import { useAuth } from './hooks/useAuth';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { useMediaQuery, NARROW_QUERY } from './hooks/useMediaQuery';
import { Board } from './components/Board';
import { Rail } from './components/Rail';
import { PlayerCard } from './components/PlayerCard';
import { ClockPanel } from './components/ClockPanel';
import { MoveLedger } from './components/MoveLedger';
import { GameControls } from './components/GameControls';
import { GameMenu } from './components/GameMenu';
import { GameSetupModal, type OpponentChoice } from './components/GameSetupModal';
import { GameOverModal } from './components/GameOverModal';
import { StartConfirmModal } from './components/StartConfirmModal';
import { LoginModal } from './components/LoginModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { SettingsModal } from './components/SettingsModal';
import { LobbyScreen } from './components/LobbyScreen';
import { Footer } from './components/Footer';
import { playerLabel } from './lib/notation';
import { randomBotNickname } from './lib/botNicknames';
import { verifyEmail } from './lib/authClient';
import { LocaleProvider } from './lib/i18n';
import { SettingsProvider, useSettings } from './lib/settings';
import { playCaptureSound, playMoveSound, playWinSound } from './lib/sound';

// Split out of the initial bundle — none of these are needed for the very first
// paint (the lobby), and TutorialModal/PuzzleScreen in particular carry a fair amount
// of their own data (board diagrams, curated puzzles). `.then(m => ({default: m.X}))`
// adapts each named export to what `lazy()` requires, without adding a default export
// to components other call sites already import by name.
const TutorialModal = lazy(() => import('./components/TutorialModal').then((m) => ({ default: m.TutorialModal })));
const OnlineGameScreen = lazy(() => import('./components/OnlineGameScreen').then((m) => ({ default: m.OnlineGameScreen })));
const TournamentScreen = lazy(() => import('./components/TournamentScreen').then((m) => ({ default: m.TournamentScreen })));
const MatchHistoryScreen = lazy(() => import('./components/MatchHistoryScreen').then((m) => ({ default: m.MatchHistoryScreen })));
const SpectateScreen = lazy(() => import('./components/SpectateScreen').then((m) => ({ default: m.SpectateScreen })));
const PuzzleScreen = lazy(() => import('./components/PuzzleScreen').then((m) => ({ default: m.PuzzleScreen })));
const LeaderboardScreen = lazy(() => import('./components/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })));
const PuzzleRushScreen = lazy(() => import('./components/PuzzleRushScreen').then((m) => ({ default: m.PuzzleRushScreen })));
const GameReviewScreen = lazy(() => import('./components/GameReviewScreen').then((m) => ({ default: m.GameReviewScreen })));

/** The Suspense fallback for every lazy screen above — brief by design, since these are small chunks even on slow connections; just enough to avoid a blank flash. */
function ScreenFallback() {
  return (
    <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--pad-xl)' }}>
      <p style={{ margin: 0, fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>Loading…</p>
    </main>
  );
}

/** Distributes over the `AnyVariant` union to recover "every chip value type any variant uses." */
type ValueOf<T> = T extends Variant<infer V> ? V : never;

interface GameNavigation {
  onRematch: () => void;
  onNewGame: () => void;
  onBackToLobby: () => void;
}

/**
 * The board + score/clock/controls/opponent/moves columns, generic over the chip value
 * type `V`. Everything hook-derived (`useGame`'s return value) arrives as a prop here.
 */
function GameShellView<V>({
  variant,
  gameApi,
  format,
  blockInteraction,
  thinkingLabel,
  scoreLabelOverrides,
  opponentSummary,
  flipped,
  onFlip,
  allowManualFlip,
  nav,
  onReviewGame,
}: {
  variant: Variant<V>;
  gameApi: ReturnType<typeof useGame<V>>;
  format: (value: V) => string;
  blockInteraction: boolean;
  /** Shown as the status line while `blockInteraction` is true — a friendly nickname's "is thinking…", not "Computer is thinking…" (never named "Computer" here, per direct product decision). */
  thinkingLabel?: string | undefined;
  scoreLabelOverrides?: Partial<Record<'white' | 'black', string>> | undefined;
  /** The match summary shown on the pre-start confirmation panel, e.g. "Pass-and-play with a friend" or "vs Kalabasa (steady)". */
  opponentSummary: string;
  flipped: boolean;
  onFlip: () => void;
  /** Friend mode auto-flips to whichever side is on move instead (GameShell computes `flipped` for that case) — the manual "Flip board" button would just get overridden on the next move, so it's hidden rather than shown-but-ineffective. */
  allowManualFlip: boolean;
  nav: GameNavigation;
  onReviewGame: () => void;
}) {
  const {
    game,
    boardGame,
    selected,
    cursor,
    ledger,
    announcement,
    legalFrom,
    destinations,
    gameOver,
    finalScores,
    resignedBy,
    activateSquare,
    moveCursor,
    activateCursor,
    clearSelection,
    playMove,
    undo,
    canUndo,
    resign,
    canResign,
    expireGame,
    viewIndex,
    isViewingHistory,
    goToMove,
    stepBack,
    stepForward,
    exitReplay,
  } = gameApi;

  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  // Gates the clock and board interaction until the player explicitly confirms on
  // `StartConfirmModal` — entering this screen straight from `GameSetupModal`'s "Start
  // game" used to begin the clock immediately, before pass-and-play's second player
  // had even looked at the board. `useState(false)` is enough (no reset needed): this
  // whole component remounts fresh on every new match, via `key={variant.id}-${matchNonce}`
  // at GameShell's own call site.
  const [started, setStarted] = useState(false);
  const { effectiveVolume } = useSettings();

  // A capture/move sound per new ply actually played — `ledger` only grows on a real
  // move (never while browsing history via `viewIndex`, and it resets to `[]`, a
  // decrease, on a fresh game, which the `>` check below correctly ignores).
  const previousLedgerLength = useRef(ledger.length);
  useEffect(() => {
    if (ledger.length > previousLedgerLength.current) {
      const lastEntry = ledger[ledger.length - 1];
      if (lastEntry && lastEntry.steps.length > 0) playCaptureSound(effectiveVolume);
      else playMoveSound(effectiveVolume);
    }
    previousLedgerLength.current = ledger.length;
  }, [ledger, effectiveVolume]);

  // One chime the instant the game ends — hot-seat is two players sharing one screen,
  // so there's no single "you won" to distinguish, unlike online play.
  const previousGameOver = useRef(gameOver);
  useEffect(() => {
    if (gameOver && !previousGameOver.current) playWinSound(effectiveVolume);
    previousGameOver.current = gameOver;
  }, [gameOver, effectiveVolume]);

  // A resignation must declare the resigner's opponent the winner even when the score
  // happens to be tied — score comparison alone can't express that (see KNOWLEDGE.md).
  const winner: Player | null = resignedBy
    ? resignedBy === 'white'
      ? 'black'
      : 'white'
    : finalScores
      ? (() => {
          const order = variant.arithmetic.compare(finalScores.white, finalScores.black);
          return order > 0 ? 'white' : order < 0 ? 'black' : null;
        })()
      : null;

  const allLegalMoves = useMemo(() => legalMoves(game), [game]);
  // docs/DAMATH_RULES.md §7.1: "the limit does not apply when a capture is mandatory" —
  // the engine already filters legalMoves() down to captures-only whenever any capture
  // exists, so "some move has a capture" and "every move is a capture" are the same check.
  const moveClockWaived = allLegalMoves.some((m) => m.captures.length > 0);
  const clock = useGameClock({
    moveKey: game.moveHistory.length,
    paused: !started || gameOver || isViewingHistory || blockInteraction,
    moveClockWaived,
    onMoveTimeout: () => {
      const pick = allLegalMoves[Math.floor(Math.random() * allLegalMoves.length)];
      if (pick) playMove(pick);
    },
    onGameTimeout: expireGame,
  });

  const lastMove = (viewIndex !== null ? (ledger[viewIndex - 1] ?? null) : (ledger.at(-1) ?? null))?.move ?? null;
  const statusLine = gameOver ? announcement : blockInteraction ? (thinkingLabel ?? 'Opponent is thinking…') : `${playerLabel(game.turn)} to move`;

  // chess.com's own convention: your own side is always the bottom card, the other
  // side the top one -- `flipped` already carries that (Board.tsx's row order flips
  // the same way), so the two cards just mirror it instead of tracking it separately.
  const topColor: Player = flipped ? 'white' : 'black';
  const bottomColor: Player = flipped ? 'black' : 'white';
  const scores = finalScores ?? game.scores;
  const labelFor = (side: Player) => scoreLabelOverrides?.[side] ?? playerLabel(side);
  const playerCard = (side: Player) => (
    <PlayerCard side={side} label={labelFor(side)} score={format(scores[side])} isTurn={!finalScores && game.turn === side} />
  );

  return (
    <main
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 0,
        padding: 'var(--pad-lg)',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: '100%', maxWidth: 'min(1400px, 96vw)', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--gap-md)', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{variant.name}</h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>{statusLine}</p>
        </header>

        {/* Board (with the clock above it) on the left at a smaller scale, controls and
            the moves list in a column to its right — chess.com's own arrangement.
            `alignItems: 'stretch'` lets the right column match the board column's full
            height, so MoveLedger's own `flex: 1` can actually use the leftover space
            instead of the column just being as tall as GameControls alone. Below the
            wrap breakpoint (narrow viewports) the row wraps and the controls column
            drops beneath the board instead of beside it. */}
        <div style={{ display: 'flex', gap: 'var(--gap-lg)', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', minHeight: 0 }}>
          <div style={{ flex: '2 1 380px', maxWidth: 560, minWidth: 260, width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
            <ClockPanel gameSeconds={clock.gameSeconds} moveSeconds={clock.moveSeconds} moveClockWaived={moveClockWaived} />
            {playerCard(topColor)}
            <Board
              game={boardGame}
              format={format}
              selected={selected}
              cursor={cursor}
              legalFrom={legalFrom}
              destinations={destinations}
              lastMove={lastMove}
              flipped={flipped}
              onActivateSquare={(pos) => {
                if (!started || gameOver || blockInteraction || isViewingHistory) return;
                activateSquare(pos);
              }}
              onMoveCursor={moveCursor}
              onActivateCursor={() => {
                if (!started || gameOver || blockInteraction || isViewingHistory) return;
                activateCursor();
              }}
              onClearSelection={clearSelection}
            />
            {playerCard(bottomColor)}
          </div>

          <div style={{ flex: '1 1 260px', maxWidth: 320, minWidth: 220, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
            <GameControls
              canUndo={canUndo}
              canResign={canResign && !blockInteraction}
              isViewingHistory={isViewingHistory}
              flipped={flipped}
              onUndo={undo}
              onResign={resign}
              onStepBack={stepBack}
              onStepForward={stepForward}
              onFlip={onFlip}
              showFlipButton={allowManualFlip}
            />
            {/* The one section that's meant to scroll internally, per request — a fixed
                max-height (MoveLedger.tsx) and a hidden scrollbar (.scroll-hidden). */}
            <MoveLedger entries={ledger} format={format} viewIndex={viewIndex} onSelectMove={goToMove} onExitReplay={exitReplay} />
          </div>
        </div>
      </div>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>

      <GameOverModal
        open={gameOver && !gameOverDismissed}
        onDismiss={() => setGameOverDismissed(true)}
        announcement={announcement}
        variant={variant}
        finalScores={finalScores}
        winner={winner}
        onRematch={nav.onRematch}
        onNewGame={nav.onNewGame}
        onBackToLobby={nav.onBackToLobby}
        onReview={onReviewGame}
        labelFor={labelFor}
      />

      <StartConfirmModal
        open={!started}
        variantName={variant.name}
        opponentSummary={opponentSummary}
        onStart={() => setStarted(true)}
        onBackToLobby={nav.onBackToLobby}
      />
    </main>
  );
}

/** Every variant gets practice mode (valueScale.ts's `ToNumber<V>` bridge, docs/AI_OPPONENT.md §4, revised) — this is the only place `useComputerOpponent` is called, generic over the chip value type `V`. `tier` is fixed for this match's whole lifetime — chosen up front via `GameSetupModal`, never adjustable once playing. */
function GameShell<V>({
  variant,
  tier,
  flipped,
  onFlip,
  nav,
  playerName,
  onReviewGame,
}: {
  variant: Variant<V>;
  tier: DifficultyTier | null;
  flipped: boolean;
  onFlip: () => void;
  nav: GameNavigation;
  /** The signed-in player's display name, if any — only ever used for the human seat in vs-AI mode (`useComputerOpponent` always seats the bot black, so the human is always white there). Friend mode leaves both seats generic: two people share one screen, and there's no single "you" to name. */
  playerName: string | null;
  onReviewGame: (variantId: VariantId, moveHistory: readonly unknown[]) => void;
}) {
  const gameApi = useGame(variant);
  const computersTurn = tier !== null && !gameApi.gameOver && gameApi.game.turn === 'black';
  useComputerOpponent(gameApi.game, tier, 'black', gameApi.playMove);

  // Picked once per mount (this component remounts on every new match, via the
  // `key={variant.id}-${matchNonce}` at the call site — a fresh key on rematch too),
  // so it's stable for the whole game but genuinely varies match to match. Never
  // "Computer (tier)" — the opponent's actual identity as a bot is still tracked
  // internally (opponentType/tier stay real facts for local practice mode's own
  // bookkeeping), just never displayed.
  const [opponentName] = useState(() => (tier ? randomBotNickname() : null));

  // Friend mode (no computer opponent) auto-flips to whichever side is actually on
  // move, so the player about to act always sees their own pieces at the bottom —
  // the whole point of sharing one screen. Computer mode keeps the manual toggle: the
  // human sits in one seat for the whole match, so there's a real fixed preference to
  // remember, not a turn to track (GameShellView hides the button otherwise, since a
  // manual flip there would just get overridden by the very next move).
  const isFriendMode = tier === null;
  const effectiveFlipped = isFriendMode ? gameApi.game.turn === 'black' : flipped;
  const opponentSummary = opponentName ? `vs ${opponentName} (${tier})` : 'Pass-and-play with a friend';
  const scoreLabelOverrides = {
    ...(!isFriendMode && playerName ? { white: playerName } : {}),
    ...(opponentName ? { black: opponentName } : {}),
  };

  return (
    <GameShellView
      variant={variant}
      gameApi={gameApi}
      format={variant.arithmetic.format}
      blockInteraction={computersTurn}
      thinkingLabel={opponentName ? `${opponentName} is thinking…` : undefined}
      scoreLabelOverrides={Object.keys(scoreLabelOverrides).length > 0 ? scoreLabelOverrides : undefined}
      opponentSummary={opponentSummary}
      flipped={effectiveFlipped}
      onFlip={onFlip}
      allowManualFlip={!isFriendMode}
      nav={nav}
      onReviewGame={() => onReviewGame(variant.id, gameApi.game.moveHistory)}
    />
  );
}

type Screen = 'lobby' | 'game' | 'online' | 'tournaments' | 'history' | 'spectate' | 'puzzles' | 'leaderboard' | 'puzzleRush' | 'review';

/**
 * Real URL paths for each screen, and the browser's own back/forward — there was no
 * client router at all before this (every "go back" was purely an in-memory state
 * change), so pressing the phone's/browser's back button just left the site entirely
 * instead of returning to the previous screen. `vercel.json`'s rewrite already serves
 * `index.html` for any path, so a direct visit or refresh on e.g. `/puzzles` works
 * once the client reads the path back into `screen` on mount, below.
 */
const SCREEN_PATHS: Record<Screen, string> = {
  lobby: '/',
  game: '/game',
  online: '/online',
  tournaments: '/tournaments',
  history: '/history',
  spectate: '/spectate',
  puzzles: '/puzzles',
  leaderboard: '/leaderboard',
  puzzleRush: '/puzzles/rush',
  review: '/review',
};

function screenFromPath(pathname: string): Screen {
  const entry = (Object.entries(SCREEN_PATHS) as [Screen, string][]).find(([, path]) => path === pathname);
  return entry?.[0] ?? 'lobby';
}

function AppShell() {
  const defaultVariant = ALL_VARIANTS.find((v) => v.id === 'whole');
  if (!defaultVariant) {
    throw new Error('unreachable: ALL_VARIANTS always includes Whole Damath');
  }
  const [variant, setVariant] = useState<AnyVariant>(defaultVariant);
  const [tier, setTier] = useState<DifficultyTier | null>(null);
  const [matchNonce, setMatchNonce] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [screen, setScreenState] = useState<Screen>(() => screenFromPath(window.location.pathname));
  // Every existing in-app "go to this screen" call site becomes `navigate(...)`
  // instead of a bare state set, so each one also pushes a real history entry —
  // that's what makes the browser's/phone's back button return to the previous
  // screen instead of leaving the site. `setScreenState` itself stays private to this
  // effect pair; nothing else should call it directly and skip the history push.
  const navigate = useCallback((next: Screen) => {
    setScreenState((current) => {
      if (current === next) return current;
      window.history.pushState({ screen: next }, '', SCREEN_PATHS[next]);
      return next;
    });
  }, []);
  useEffect(() => {
    // The current entry needs a state object too, or the *first* back-press (nothing
    // pushed yet this session) has nothing to restore from — this also folds in a URL
    // that was reached by direct visit/refresh rather than in-app navigation.
    window.history.replaceState({ screen }, '', SCREEN_PATHS[screen]);
    function onPopState(event: PopStateEvent) {
      const state = event.state as { screen?: Screen } | null;
      setScreenState(state?.screen ?? screenFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // Deliberately mount-only (`screen` read once, not a dependency): this wires up
    // browser history plumbing a single time. `navigate()` already pushes a fresh
    // entry on every subsequent screen change; re-running this per change would just
    // stomp the entry `navigate()` just pushed with a duplicate replace.
  }, []);
  // Carries a tournament id + the room created for one of its matches across the
  // TournamentScreen → OnlineGameScreen → TournamentScreen round trip. Both screens are
  // conditionally rendered (unmounted while off-screen), so their own local state
  // (selected tournament, room id) can't survive the trip on its own — this is the one
  // piece of state that needs to.
  const [tournamentContext, setTournamentContext] = useState<{ tournamentId: string; roomId: string | null } | null>(null);
  // Mirrors tournamentContext's round-trip shape for MatchHistoryScreen -> OnlineGameScreen
  // -> back to MatchHistoryScreen. Mutually exclusive with tournamentContext in practice
  // (a room only ever has one origin at a time); kept as its own piece of state rather than
  // folded into tournamentContext since a history entry isn't a tournament match.
  const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);
  // Same round-trip shape as historyRoomId, for SpectateScreen -> OnlineGameScreen -> back
  // to SpectateScreen. Also mutually exclusive with the other two origin states.
  const [spectateRoomId, setSpectateRoomId] = useState<string | null>(null);
  // What GameReviewScreen analyzes -- set the moment "Review game" is clicked (local
  // GameOverModal or OnlineGameScreen's finished panel), read once GameReviewScreen
  // mounts. `moveHistory` stays untyped (`readonly unknown[]`) here, same JSON-boundary
  // reasoning OnlineGameScreen's own prop already uses -- GameReviewScreen re-attaches a
  // concrete `V` once it resolves `variantId`.
  const [reviewContext, setReviewContext] = useState<{ variantId: VariantId; moveHistory: readonly unknown[] } | null>(null);
  function openReview(variantId: VariantId, moveHistory: readonly unknown[]) {
    setReviewContext({ variantId, moveHistory });
    navigate('review');
  }
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupInitial, setSetupInitial] = useState<{ variant: AnyVariant; opponent: OpponentChoice }>({
    variant: defaultVariant,
    opponent: { kind: 'friend' },
  });
  // Set only when the setup modal was opened from a lobby card that already implies the
  // opponent kind — hides GameSetupModal's redundant Opponent toggle in that case (a
  // "friend" choice inside "Play the Computer" doesn't make sense when there's already a
  // dedicated Play a Friend button, and vice versa). Cleared for Menu > New game, which
  // still needs to offer both.
  const [setupFixedKind, setSetupFixedKind] = useState<'friend' | 'computer' | undefined>(undefined);
  // Populated once, on mount, from `?resetToken=`/`?verifyToken=` in the URL -- the
  // "link" a real email would have delivered (apps/server's auth/routes.ts logs it
  // instead, per the no-email-provider decision). There's no client router here, so
  // both land on the root path and are told apart by which query param is present.
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [verifyBanner, setVerifyBanner] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingReset = params.get('resetToken');
    const incomingVerify = params.get('verifyToken');
    if (!incomingReset && !incomingVerify) return;
    // Clear the token from the address bar immediately -- it's a one-time-use secret,
    // it shouldn't linger somewhere a browser history entry or a screenshot could leak it.
    window.history.replaceState(null, '', window.location.pathname);
    if (incomingReset) setResetToken(incomingReset);
    if (incomingVerify) {
      verifyEmail(incomingVerify)
        .then(() => setVerifyBanner('Your email is now verified.'))
        .catch((err: unknown) => setVerifyBanner(err instanceof Error ? err.message : 'Could not verify this link.'));
    }
  }, []);
  const auth = useAuth();
  // A second, independent /ws connection from the one useOnlineGame opens while
  // actually playing — active whenever signed in, regardless of which screen is showing,
  // so the online count and "a tournament changed" signal are available on the lobby and
  // tournaments screen without needing to be inside a game.
  const live = useLiveUpdates(auth.token);

  function enterGame(newVariant: AnyVariant, opponent: OpponentChoice) {
    setVariant(newVariant);
    setTier(opponent.kind === 'computer' ? opponent.tier : null);
    setMatchNonce((n) => n + 1);
    navigate('game');
  }

  function openSetupForComputer() {
    setSetupInitial({ variant, opponent: { kind: 'computer', tier: tier ?? 'steady' } });
    setSetupFixedKind('computer');
    setSetupOpen(true);
  }

  /** "Play a Friend" now opens the same setup step Play the Computer already used, instead of starting immediately with whatever variant happened to be selected last — the chip type is chosen up front and locked for the match, same rule as the AI tier. */
  function openSetupForFriend() {
    setSetupInitial({ variant, opponent: { kind: 'friend' } });
    setSetupFixedKind('friend');
    setSetupOpen(true);
  }

  function openSetupForNewGame() {
    setSetupInitial({ variant, opponent: tier !== null ? { kind: 'computer', tier } : { kind: 'friend' } });
    setSetupFixedKind(undefined);
    setSetupOpen(true);
  }

  const nav: GameNavigation = {
    onRematch: () => setMatchNonce((n) => n + 1),
    onNewGame: openSetupForNewGame,
    onBackToLobby: () => navigate('lobby'),
  };

  // A live game screen fits the viewport height instead of scrolling the page on a
  // desktop-width window — the board and its surrounding panels are sized (Board.tsx,
  // OnlineBoard.tsx, GameShellView above) to fit inside it. Below `NARROW_QUERY`
  // (phones/small tablets, same breakpoint Rail already switches layout at), this is
  // deliberately left off: a real small screen still needs to scroll rather than
  // squeeze everything into an unreadable size.
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const lockScroll = !isNarrow && (screen === 'game' || screen === 'online');

  return (
    <>
      {/* `flexWrap` lets Rail (a normal 232px sidebar on wide screens, but a full-width
          top bar on narrow ones — see Rail.tsx's own `useMediaQuery`) push the game
          shell onto its own row underneath, purely by CSS reacting to Rail's own
          returned width. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, minWidth: 0, height: lockScroll ? '100dvh' : undefined, overflow: lockScroll ? 'hidden' : undefined }}>
      {screen === 'lobby' && (
        <LobbyScreen
          user={auth.user}
          onSignIn={() => setLoginOpen(true)}
          onPlayFriend={openSetupForFriend}
          onPlayComputer={openSetupForComputer}
          onPlayOnline={() => navigate('online')}
          onLearn={() => setTutorialOpen(true)}
          onTournaments={() => navigate('tournaments')}
          onPuzzles={() => navigate('puzzles')}
          onLeaderboard={auth.user ? () => navigate('leaderboard') : null}
          onMatchHistory={auth.user ? () => navigate('history') : null}
          onSpectate={auth.user ? () => navigate('spectate') : null}
          onlineCount={live.onlineCount}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {screen === 'puzzles' && (
        <Suspense fallback={<ScreenFallback />}>
          <PuzzleScreen onBackToLobby={() => navigate('lobby')} onPuzzleRush={() => navigate('puzzleRush')} />
        </Suspense>
      )}

      {screen === 'puzzleRush' && (
        <Suspense fallback={<ScreenFallback />}>
          <PuzzleRushScreen onBackToPuzzles={() => navigate('puzzles')} />
        </Suspense>
      )}

      {screen === 'review' && reviewContext && (
        <Suspense fallback={<ScreenFallback />}>
          <GameReviewScreen variantId={reviewContext.variantId} moveHistory={reviewContext.moveHistory} onBackToLobby={() => navigate('lobby')} />
        </Suspense>
      )}

      {screen === 'leaderboard' && (
        <Suspense fallback={<ScreenFallback />}>
          <LeaderboardScreen token={auth.token} myUserId={auth.user?.id ?? null} onBackToLobby={() => navigate('lobby')} />
        </Suspense>
      )}

      {screen === 'online' && (
        <Suspense fallback={<ScreenFallback />}>
          <OnlineGameScreen
            token={auth.token}
            user={auth.user}
            initialRoomId={historyRoomId ?? spectateRoomId ?? tournamentContext?.roomId ?? undefined}
            origin={historyRoomId ? 'history' : spectateRoomId ? 'spectate' : 'tournament'}
            onGameFinished={auth.refreshUser}
            onReviewGame={openReview}
            onOpenTutorial={() => setTutorialOpen(true)}
            onBackToLobby={() => {
              if (historyRoomId) {
                setHistoryRoomId(null);
                navigate('history');
                return;
              }
              if (spectateRoomId) {
                setSpectateRoomId(null);
                navigate('spectate');
                return;
              }
              navigate(tournamentContext ? 'tournaments' : 'lobby');
              setTournamentContext((ctx) => (ctx ? { tournamentId: ctx.tournamentId, roomId: null } : null));
            }}
            onOpenLogin={() => setLoginOpen(true)}
          />
        </Suspense>
      )}

      {screen === 'spectate' && (
        <Suspense fallback={<ScreenFallback />}>
          <SpectateScreen
            token={auth.token}
            onBackToLobby={() => navigate('lobby')}
            onWatch={(roomId) => {
              setSpectateRoomId(roomId);
              navigate('online');
            }}
          />
        </Suspense>
      )}

      {screen === 'history' && (
        <Suspense fallback={<ScreenFallback />}>
          <MatchHistoryScreen
            token={auth.token}
            onBackToLobby={() => navigate('lobby')}
            onViewGame={(roomId) => {
              setHistoryRoomId(roomId);
              navigate('online');
            }}
          />
        </Suspense>
      )}

      {screen === 'tournaments' && (
        <Suspense fallback={<ScreenFallback />}>
          <TournamentScreen
            token={auth.token}
            user={auth.user}
            initialSelectedId={tournamentContext?.tournamentId ?? null}
            tournamentEventCount={live.tournamentEventCount}
            onlineCount={live.onlineCount}
            onPlayMatch={(tournamentId, roomId) => {
              setTournamentContext({ tournamentId, roomId });
              navigate('online');
            }}
            onBackToLobby={() => {
              setTournamentContext(null);
              navigate('lobby');
            }}
            onOpenLogin={() => setLoginOpen(true)}
          />
        </Suspense>
      )}

      {screen === 'game' && (
        <>
          <Rail
            onOpenTutorial={() => setTutorialOpen(true)}
            menuButton={<GameMenu onRematch={nav.onRematch} onNewGame={nav.onNewGame} onBackToLobby={nav.onBackToLobby} />}
          />
          <GameShell<ValueOf<AnyVariant>>
            key={`${variant.id}-${String(matchNonce)}`}
            variant={variant}
            tier={tier}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            nav={nav}
            playerName={auth.user?.displayName ?? null}
            onReviewGame={openReview}
          />
        </>
      )}

      {verifyBanner && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 'var(--pad-md)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            background: 'var(--surface-panel)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--pad-sm) var(--pad-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--gap-md)',
          }}
        >
          <span style={{ fontSize: 'var(--fs-meta)' }}>{verifyBanner}</span>
          <button
            type="button"
            onClick={() => setVerifyBanner(null)}
            aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--fs-body)' }}
          >
            ×
          </button>
        </div>
      )}
      {resetToken && <ResetPasswordModal token={resetToken} onClose={() => setResetToken(null)} />}

      {/* Only actually mounted once opened — a lazy component's chunk starts loading
          the instant it's in the tree, `open` prop or not, so gating the mount itself
          (not just what it renders) is what keeps this out of the initial bundle load. */}
      {tutorialOpen && (
        <Suspense fallback={null}>
          <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
        </Suspense>
      )}
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={auth.login}
        onSignup={auth.signup}
        onGoogleAuth={auth.googleAuth}
        onCompleteGoogleSignup={auth.completeGoogleSignup}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={auth.user}
        onUpdateProfile={auth.updateProfile}
        token={auth.token}
        onSignOut={auth.logout}
      />
      <GameSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onConfirm={(v, opponent) => {
          enterGame(v, opponent);
          setSetupOpen(false);
        }}
        initialVariant={setupInitial.variant}
        initialOpponent={setupInitial.opponent}
        fixedOpponentKind={setupFixedKind}
      />
      </div>
      {/* Omitted during locked-scroll gameplay (see the `height: 100dvh, overflow:
          hidden` above) — that layout deliberately fits the board to one viewport with
          no page scroll, and a footer there would either clip or force back the exact
          scrolling it exists to avoid. */}
      {!lockScroll && <Footer />}
    </>
  );
}

export function App() {
  return (
    <LocaleProvider>
      <SettingsProvider>
        <AppShell />
      </SettingsProvider>
    </LocaleProvider>
  );
}
