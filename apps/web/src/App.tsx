import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_VARIANTS, legalMoves } from '@damath/engine';
import type { AnyVariant, Player, Variant } from '@damath/engine';
import type { DifficultyTier } from '@damath/ai';
import { useGame } from './hooks/useGame';
import { useComputerOpponent } from './hooks/useComputerOpponent';
import { useGameClock } from './hooks/useGameClock';
import { useAuth } from './hooks/useAuth';
import { useLiveUpdates } from './hooks/useLiveUpdates';
import { Board } from './components/Board';
import { Rail } from './components/Rail';
import { PlayerCard } from './components/PlayerCard';
import { ClockPanel } from './components/ClockPanel';
import { MoveLedger } from './components/MoveLedger';
import { GameControls } from './components/GameControls';
import { GameMenu } from './components/GameMenu';
import { GameSetupModal, type OpponentChoice } from './components/GameSetupModal';
import { GameOverModal } from './components/GameOverModal';
import { TutorialModal } from './components/TutorialModal';
import { LoginModal } from './components/LoginModal';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { SettingsModal } from './components/SettingsModal';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { TournamentScreen } from './components/TournamentScreen';
import { MatchHistoryScreen } from './components/MatchHistoryScreen';
import { SpectateScreen } from './components/SpectateScreen';
import { PuzzleScreen } from './components/PuzzleScreen';
import { playerLabel } from './lib/notation';
import { randomBotNickname } from './lib/botNicknames';
import { verifyEmail } from './lib/authClient';
import { LocaleProvider } from './lib/i18n';
import { SettingsProvider, useSettings } from './lib/settings';
import { playCaptureSound, playMoveSound, playWinSound } from './lib/sound';

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
  flipped,
  onFlip,
  nav,
}: {
  variant: Variant<V>;
  gameApi: ReturnType<typeof useGame<V>>;
  format: (value: V) => string;
  blockInteraction: boolean;
  /** Shown as the status line while `blockInteraction` is true — a friendly nickname's "is thinking…", not "Computer is thinking…" (never named "Computer" here, per direct product decision). */
  thinkingLabel?: string | undefined;
  scoreLabelOverrides?: Partial<Record<'white' | 'black', string>> | undefined;
  flipped: boolean;
  onFlip: () => void;
  nav: GameNavigation;
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
    paused: gameOver || isViewingHistory || blockInteraction,
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
        padding: 'var(--pad-xl)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 'min(1800px, 96vw)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--gap-md)', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{variant.name}</h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>{statusLine}</p>
        </header>

        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
          {/* Controls (back/forward foremost) and the moves list, one single column on
              the left of the board instead of two separate side columns. */}
          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
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
            />
            {/* The one section that's meant to scroll internally, per request — a fixed
                max-height (MoveLedger.tsx) and a hidden scrollbar (.scroll-hidden). */}
            <MoveLedger entries={ledger} format={format} viewIndex={viewIndex} onSelectMove={goToMove} onExitReplay={exitReplay} />
          </div>

          <div style={{ flex: '3 1 420px', maxWidth: 760, minWidth: 280, width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' }}>
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
                if (gameOver || blockInteraction || isViewingHistory) return;
                activateSquare(pos);
              }}
              onMoveCursor={moveCursor}
              onActivateCursor={() => {
                if (gameOver || blockInteraction || isViewingHistory) return;
                activateCursor();
              }}
              onClearSelection={clearSelection}
            />
            {playerCard(bottomColor)}
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
}: {
  variant: Variant<V>;
  tier: DifficultyTier | null;
  flipped: boolean;
  onFlip: () => void;
  nav: GameNavigation;
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

  return (
    <GameShellView
      variant={variant}
      gameApi={gameApi}
      format={variant.arithmetic.format}
      blockInteraction={computersTurn}
      thinkingLabel={opponentName ? `${opponentName} is thinking…` : undefined}
      scoreLabelOverrides={opponentName ? { black: opponentName } : undefined}
      flipped={flipped}
      onFlip={onFlip}
      nav={nav}
    />
  );
}

type Screen = 'lobby' | 'game' | 'online' | 'tournaments' | 'history' | 'spectate' | 'puzzles';

function AppShell() {
  const defaultVariant = ALL_VARIANTS.find((v) => v.id === 'whole');
  if (!defaultVariant) {
    throw new Error('unreachable: ALL_VARIANTS always includes Whole Damath');
  }
  const [variant, setVariant] = useState<AnyVariant>(defaultVariant);
  const [tier, setTier] = useState<DifficultyTier | null>(null);
  const [matchNonce, setMatchNonce] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [screen, setScreen] = useState<Screen>('lobby');
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
    setScreen('game');
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
    onBackToLobby: () => setScreen('lobby'),
  };

  return (
    // `flexWrap` lets Rail (a normal 232px sidebar on wide screens, but a full-width top
    // bar on narrow ones — see Rail.tsx's own `useMediaQuery`) push the game shell onto
    // its own row underneath, purely by CSS reacting to Rail's own returned width.
    <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
      {screen === 'lobby' && (
        <LobbyScreen
          user={auth.user}
          onSignIn={() => setLoginOpen(true)}
          onPlayFriend={openSetupForFriend}
          onPlayComputer={openSetupForComputer}
          onPlayOnline={() => setScreen('online')}
          onLearn={() => setTutorialOpen(true)}
          onTournaments={() => setScreen('tournaments')}
          onPuzzles={() => setScreen('puzzles')}
          onMatchHistory={auth.user ? () => setScreen('history') : null}
          onSpectate={auth.user ? () => setScreen('spectate') : null}
          onlineCount={live.onlineCount}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {screen === 'puzzles' && <PuzzleScreen onBackToLobby={() => setScreen('lobby')} />}

      {screen === 'online' && (
        <OnlineGameScreen
          token={auth.token}
          user={auth.user}
          initialRoomId={historyRoomId ?? spectateRoomId ?? tournamentContext?.roomId ?? undefined}
          origin={historyRoomId ? 'history' : spectateRoomId ? 'spectate' : 'tournament'}
          onGameFinished={auth.refreshUser}
          onOpenTutorial={() => setTutorialOpen(true)}
          onBackToLobby={() => {
            if (historyRoomId) {
              setHistoryRoomId(null);
              setScreen('history');
              return;
            }
            if (spectateRoomId) {
              setSpectateRoomId(null);
              setScreen('spectate');
              return;
            }
            setScreen(tournamentContext ? 'tournaments' : 'lobby');
            setTournamentContext((ctx) => (ctx ? { tournamentId: ctx.tournamentId, roomId: null } : null));
          }}
          onOpenLogin={() => setLoginOpen(true)}
        />
      )}

      {screen === 'spectate' && (
        <SpectateScreen
          token={auth.token}
          onBackToLobby={() => setScreen('lobby')}
          onWatch={(roomId) => {
            setSpectateRoomId(roomId);
            setScreen('online');
          }}
        />
      )}

      {screen === 'history' && (
        <MatchHistoryScreen
          token={auth.token}
          onBackToLobby={() => setScreen('lobby')}
          onViewGame={(roomId) => {
            setHistoryRoomId(roomId);
            setScreen('online');
          }}
        />
      )}

      {screen === 'tournaments' && (
        <TournamentScreen
          token={auth.token}
          user={auth.user}
          initialSelectedId={tournamentContext?.tournamentId ?? null}
          tournamentEventCount={live.tournamentEventCount}
          onlineCount={live.onlineCount}
          onPlayMatch={(tournamentId, roomId) => {
            setTournamentContext({ tournamentId, roomId });
            setScreen('online');
          }}
          onBackToLobby={() => {
            setTournamentContext(null);
            setScreen('lobby');
          }}
          onOpenLogin={() => setLoginOpen(true)}
        />
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

      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
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
