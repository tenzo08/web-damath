import { useState } from 'react';
import { INTEGER_VARIANTS } from '@damath/engine';
import type { DifficultyTier } from '@damath/ai';
import { useGame } from './hooks/useGame';
import { useComputerOpponent } from './hooks/useComputerOpponent';
import { Board } from './components/Board';
import { Rail } from './components/Rail';
import { ScorePanel } from './components/ScorePanel';
import { MoveLedger } from './components/MoveLedger';
import { OpponentPanel } from './components/OpponentPanel';
import { playerLabel } from './lib/notation';

export function App() {
  const defaultVariant = INTEGER_VARIANTS[0];
  if (!defaultVariant) {
    throw new Error('unreachable: INTEGER_VARIANTS is never empty');
  }
  const game0 = useGame(defaultVariant);
  const {
    game,
    variant,
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
    newGame,
    playMove,
  } = game0;

  const [tier, setTier] = useState<DifficultyTier | null>(null);
  const computersTurn = tier !== null && !gameOver && game.turn === 'black';
  useComputerOpponent(game, tier, 'black', playMove);

  const lastMove = (ledger.at(-1) ?? null)?.move ?? null;
  const statusLine = gameOver ? announcement : computersTurn ? 'Computer is thinking…' : `${playerLabel(game.turn)} to move`;
  const scoreLabels = tier ? { black: `Computer (${tier})` } : undefined;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Rail variants={INTEGER_VARIANTS} current={variant} onNewGame={newGame} />
      <main
        style={{
          flex: 1,
          padding: 'var(--pad-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--gap-lg)',
          overflow: 'auto',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-title)', fontWeight: 700 }}>{variant.name}</h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-label)', color: 'var(--text-secondary)' }}>{statusLine}</p>
        </header>

        <div
          style={{
            display: 'flex',
            gap: 'var(--gap-xl)',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: '1 1 480px', maxWidth: 640 }}>
            <Board
              game={game}
              selected={selected}
              cursor={cursor}
              legalFrom={legalFrom}
              destinations={destinations}
              lastMove={lastMove}
              onActivateSquare={(pos) => {
                if (gameOver || computersTurn) return;
                activateSquare(pos);
              }}
              onMoveCursor={moveCursor}
              onActivateCursor={() => {
                if (gameOver || computersTurn) return;
                activateCursor();
              }}
              onClearSelection={clearSelection}
            />
          </div>

          <div
            style={{
              flex: '0 1 320px',
              minWidth: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--gap-lg)',
              alignSelf: 'stretch',
            }}
          >
            <ScorePanel game={game} finalScores={finalScores} labelOverrides={scoreLabels} />
            <OpponentPanel tier={tier} onChange={setTier} thinking={computersTurn} />
            <MoveLedger entries={ledger} />
          </div>
        </div>
      </main>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
    </div>
  );
}
