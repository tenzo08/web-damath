import { useMemo, useState, type ReactNode } from 'react';
import { ALL_VARIANTS, legalMoves } from '@damath/engine';
import type { AnyVariant, Variant } from '@damath/engine';
import type { DifficultyTier } from '@damath/ai';
import { useGame } from './hooks/useGame';
import { useComputerOpponent } from './hooks/useComputerOpponent';
import { useGameClock } from './hooks/useGameClock';
import { useAuth } from './hooks/useAuth';
import { Board } from './components/Board';
import { Rail } from './components/Rail';
import { ScorePanel } from './components/ScorePanel';
import { ClockPanel } from './components/ClockPanel';
import { MoveLedger } from './components/MoveLedger';
import { OpponentPanel } from './components/OpponentPanel';
import { GameControls } from './components/GameControls';
import { TutorialModal } from './components/TutorialModal';
import { LoginModal } from './components/LoginModal';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineGameScreen } from './components/OnlineGameScreen';
import { TournamentScreen } from './components/TournamentScreen';
import { playerLabel } from './lib/notation';
import { asIntegerVariant } from './lib/integer-variant';

/** Distributes over the `AnyVariant` union to recover "every chip value type any variant uses." */
type ValueOf<T> = T extends Variant<infer V> ? V : never;

/**
 * The board + score/ledger/opponent column, generic over the chip value type `V`.
 * Everything hook-derived (`useGame`'s return value) arrives as a prop here — this
 * component itself calls no hooks of its own beyond the clock, so it's safe to render
 * conditionally from `App` without violating the rules of hooks.
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
}: {
  variant: Variant<V>;
  gameApi: ReturnType<typeof useGame<V>>;
  format: (value: V) => string;
  opponentPanel: ReactNode;
  blockInteraction: boolean;
  scoreLabelOverrides?: Partial<Record<'white' | 'black', string>> | undefined;
  flipped: boolean;
  onFlip: () => void;
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
        flex: 1,
        padding: 'var(--pad-xl)',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1240, display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{variant.name}</h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>{statusLine}</p>
        </header>

        <div style={{ display: 'flex', gap: 'var(--gap-xl)', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div style={{ flex: '3 1 480px', maxWidth: 760 }}>
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

          <div
            style={{
              flex: '1 1 340px',
              maxWidth: 380,
              minWidth: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--gap-lg)',
              alignSelf: 'stretch',
            }}
          >
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
            <MoveLedger entries={ledger} format={format} viewIndex={viewIndex} onSelectMove={goToMove} onExitReplay={exitReplay} />
          </div>
        </div>
      </div>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
    </main>
  );
}

/** The three integer variants (docs/AI_OPPONENT.md §4) get practice mode; this is the only place `useComputerOpponent` is called, so it's always called with a concrete `GameState<number>`. */
function IntegerGameShell({
  variant,
  flipped,
  onFlip,
  autoStartComputer,
}: {
  variant: Variant<number>;
  flipped: boolean;
  onFlip: () => void;
  autoStartComputer: boolean;
}) {
  const gameApi = useGame(variant);
  const [tier, setTier] = useState<DifficultyTier | null>(autoStartComputer ? 'steady' : null);
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
      opponentPanel={<OpponentPanel tier={tier} onChange={setTier} thinking={computersTurn} />}
    />
  );
}

function GenericGameShell<V>({ variant, flipped, onFlip }: { variant: Variant<V>; flipped: boolean; onFlip: () => void }) {
  const gameApi = useGame(variant);
  return (
    <GameShellView
      variant={variant}
      gameApi={gameApi}
      format={variant.arithmetic.format}
      blockInteraction={false}
      flipped={flipped}
      onFlip={onFlip}
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

type Screen = 'lobby' | 'game' | 'online' | 'tournaments';

export function App() {
  const defaultVariant = ALL_VARIANTS.find((v) => v.id === 'whole');
  if (!defaultVariant) {
    throw new Error('unreachable: ALL_VARIANTS always includes Whole Damath');
  }
  const [variant, setVariant] = useState<AnyVariant>(defaultVariant);
  const [matchNonce, setMatchNonce] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [autoStartComputer, setAutoStartComputer] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const auth = useAuth();
  const integerVariant = asIntegerVariant(variant);

  function enterGame(mode: 'friend' | 'computer') {
    setAutoStartComputer(mode === 'computer');
    setMatchNonce((n) => n + 1);
    setScreen('game');
  }

  return (
    <div style={{ display: 'flex', flex: 1 }}>
      {screen === 'lobby' && (
        <LobbyScreen
          user={auth.user}
          onSignIn={() => setLoginOpen(true)}
          onSignOut={auth.logout}
          onPlayFriend={() => enterGame('friend')}
          onPlayComputer={() => enterGame('computer')}
          onPlayOnline={() => setScreen('online')}
          onLearn={() => setTutorialOpen(true)}
          onTournaments={() => setScreen('tournaments')}
        />
      )}

      {screen === 'online' && (
        <OnlineGameScreen token={auth.token} onBackToLobby={() => setScreen('lobby')} onOpenLogin={() => setLoginOpen(true)} />
      )}

      {screen === 'tournaments' && (
        <TournamentScreen
          token={auth.token}
          user={auth.user}
          onBackToLobby={() => setScreen('lobby')}
          onOpenLogin={() => setLoginOpen(true)}
        />
      )}

      {screen === 'game' && (
        <>
          <Rail
            variants={ALL_VARIANTS}
            current={variant}
            onSelectVariant={setVariant}
            onNewGame={() => setMatchNonce((n) => n + 1)}
            onOpenTutorial={() => setTutorialOpen(true)}
            onBackToLobby={() => setScreen('lobby')}
          />
          {integerVariant ? (
            <IntegerGameShell
              key={`${variant.id}-${String(matchNonce)}`}
              variant={integerVariant}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              autoStartComputer={autoStartComputer}
            />
          ) : (
            <GenericGameShell<ValueOf<AnyVariant>>
              key={`${variant.id}-${String(matchNonce)}`}
              variant={variant}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
            />
          )}
        </>
      )}

      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={auth.login} onSignup={auth.signup} />
    </div>
  );
}
