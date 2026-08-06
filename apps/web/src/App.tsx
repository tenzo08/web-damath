import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { ScorePanel } from './components/ScorePanel';
import { ClockPanel } from './components/ClockPanel';
import { MoveLedger } from './components/MoveLedger';
import { OpponentStatus } from './components/OpponentStatus';
import { GameControls } from './components/GameControls';
import { GameMenu } from './components/GameMenu';
import { GameSetupModal, type OpponentChoice } from './components/GameSetupModal';
import { GameOverModal } from './components/GameOverModal';
import { TutorialModal } from './components/TutorialModal';
import { LoginModal } from './components/LoginModal';
import { SettingsModal } from './components/SettingsModal';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { TournamentScreen } from './components/TournamentScreen';
import { MatchHistoryScreen } from './components/MatchHistoryScreen';
import { playerLabel } from './lib/notation';
import { asIntegerVariant } from './lib/integer-variant';
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
  opponentPanel,
  blockInteraction,
  scoreLabelOverrides,
  flipped,
  onFlip,
  nav,
}: {
  variant: Variant<V>;
  gameApi: ReturnType<typeof useGame<V>>;
  format: (value: V) => string;
  opponentPanel: ReactNode;
  blockInteraction: boolean;
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
  const statusLine = gameOver ? announcement : blockInteraction ? 'Computer is thinking…' : `${playerLabel(game.turn)} to move`;

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
          <div style={{ flex: '3 1 420px', maxWidth: 760, minWidth: 280, width: '100%' }}>
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
          </div>

          <div style={{ flex: '1 1 280px', maxWidth: 340, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
            <ScorePanel game={game} finalScores={finalScores} format={format} labelOverrides={scoreLabelOverrides} />
            <ClockPanel gameSeconds={clock.gameSeconds} moveSeconds={clock.moveSeconds} moveClockWaived={moveClockWaived} />
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
            {opponentPanel}
          </div>

          {/* The one column that's meant to scroll internally, per request — a fixed
              max-height (MoveLedger.tsx) and a hidden scrollbar (.scroll-hidden). */}
          <div style={{ flex: '1 1 260px', maxWidth: 320, minWidth: 220, display: 'flex', flexDirection: 'column' }}>
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
      />
    </main>
  );
}

/** The three integer variants (docs/AI_OPPONENT.md §4) get practice mode; this is the only place `useComputerOpponent` is called, so it's always called with a concrete `GameState<number>`. `tier` is fixed for this match's whole lifetime — chosen up front via `GameSetupModal`, never adjustable once playing. */
function IntegerGameShell({
  variant,
  tier,
  flipped,
  onFlip,
  nav,
}: {
  variant: Variant<number>;
  tier: DifficultyTier | null;
  flipped: boolean;
  onFlip: () => void;
  nav: GameNavigation;
}) {
  const gameApi = useGame(variant);
  const computersTurn = tier !== null && !gameApi.gameOver && gameApi.game.turn === 'black';
  useComputerOpponent(gameApi.game, tier, 'black', gameApi.playMove);

  const scoreLabelOverrides = tier ? { black: `Computer (${tier})` } : undefined;

  return (
    <GameShellView
      variant={variant}
      gameApi={gameApi}
      format={variant.arithmetic.format}
      blockInteraction={computersTurn}
      scoreLabelOverrides={scoreLabelOverrides}
      flipped={flipped}
      onFlip={onFlip}
      nav={nav}
      opponentPanel={<OpponentStatus tier={tier} thinking={computersTurn} />}
    />
  );
}

function GenericGameShell<V>({ variant, flipped, onFlip, nav }: { variant: Variant<V>; flipped: boolean; onFlip: () => void; nav: GameNavigation }) {
  const gameApi = useGame(variant);
  return (
    <GameShellView
      variant={variant}
      gameApi={gameApi}
      format={variant.arithmetic.format}
      blockInteraction={false}
      flipped={flipped}
      onFlip={onFlip}
      nav={nav}
      opponentPanel={
        <section
          aria-label="Opponent"
          style={{
            background: 'var(--surface-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--pad-lg)',
            fontSize: 'var(--fs-meta)',
            color: 'var(--text-muted)',
          }}
        >
          The computer opponent plays Whole, Counting, and Integer Damath only — an evaluation function needs a
          numeric scale (docs/AI_OPPONENT.md §4). Hot-seat two-player only for this variant.
        </section>
      }
    />
  );
}

type Screen = 'lobby' | 'game' | 'online' | 'tournaments' | 'history';

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
  const auth = useAuth();
  // A second, independent /ws connection from the one useOnlineGame opens while
  // actually playing — active whenever signed in, regardless of which screen is showing,
  // so the online count and "a tournament changed" signal are available on the lobby and
  // tournaments screen without needing to be inside a game.
  const live = useLiveUpdates(auth.token);
  const integerVariant = asIntegerVariant(variant);

  function enterGame(newVariant: AnyVariant, opponent: OpponentChoice) {
    setVariant(newVariant);
    setTier(opponent.kind === 'computer' ? opponent.tier : null);
    setMatchNonce((n) => n + 1);
    setScreen('game');
  }

  function openSetupForComputer() {
    const startingVariant = asIntegerVariant(variant) ? variant : (ALL_VARIANTS.find((v) => v.id === 'integer') ?? variant);
    setSetupInitial({ variant: startingVariant, opponent: { kind: 'computer', tier: tier ?? 'steady' } });
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
          onSignOut={auth.logout}
          onPlayFriend={openSetupForFriend}
          onPlayComputer={openSetupForComputer}
          onPlayOnline={() => setScreen('online')}
          onLearn={() => setTutorialOpen(true)}
          onTournaments={() => setScreen('tournaments')}
          onMatchHistory={auth.user ? () => setScreen('history') : null}
          onlineCount={live.onlineCount}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {screen === 'online' && (
        <OnlineGameScreen
          token={auth.token}
          initialRoomId={historyRoomId ?? tournamentContext?.roomId ?? undefined}
          origin={historyRoomId ? 'history' : 'tournament'}
          onGameFinished={auth.refreshUser}
          onBackToLobby={() => {
            if (historyRoomId) {
              setHistoryRoomId(null);
              setScreen('history');
              return;
            }
            setScreen(tournamentContext ? 'tournaments' : 'lobby');
            setTournamentContext((ctx) => (ctx ? { tournamentId: ctx.tournamentId, roomId: null } : null));
          }}
          onOpenLogin={() => setLoginOpen(true)}
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
          {integerVariant ? (
            <IntegerGameShell
              key={`${variant.id}-${String(matchNonce)}`}
              variant={integerVariant}
              tier={tier}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              nav={nav}
            />
          ) : (
            <GenericGameShell<ValueOf<AnyVariant>>
              key={`${variant.id}-${String(matchNonce)}`}
              variant={variant}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              nav={nav}
            />
          )}
        </>
      )}

      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={auth.login} onSignup={auth.signup} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={auth.user} onUpdateProfile={auth.updateProfile} />
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
