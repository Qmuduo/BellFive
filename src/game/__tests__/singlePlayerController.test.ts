/** @jest-environment node */
import * as engine from '../engine';
import { SinglePlayerController, type SinglePlayerUpdate } from '../singlePlayerController';

const difficulties = [
  { difficulty: 'easy', flipDelay: 1500, ringDelay: 1300 },
  { difficulty: 'normal', flipDelay: 1050, ringDelay: 850 },
  { difficulty: 'hard', flipDelay: 650, ringDelay: 450 },
] as const;

describe('single-player reaction windows', () => {
  let controller: SinglePlayerController;
  let latest: SinglePlayerUpdate;

  beforeEach(() => {
    jest.useFakeTimers();
    // Keep the deck ordered and prevent random false rings.
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    controller = new SinglePlayerController({ onUpdate: update => { latest = update; } });
  });

  afterEach(() => {
    controller.stop();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function startWithRingOpportunity(difficulty: 'easy' | 'normal' | 'hard') {
    const game = engine.createGame();
    const drawPile = [...game.players.A.drawPile];
    const opponentPile = [...game.players.B.drawPile];
    const fiveBananas = opponentPile.findIndex(card => card.id === 'C056');
    [drawPile[0], opponentPile[fiveBananas]] = [opponentPile[fiveBananas], drawPile[0]];
    // Control the deal only; flips, ring validation, and collection use the real engine.
    jest.spyOn(engine, 'createGame').mockReturnValue({
      ...game,
      players: {
        A: { ...game.players.A, drawPile },
        B: { ...game.players.B, drawPile: opponentPile },
      },
    });
    controller.start({ nickname: 'Player', avatarId: 'bell' }, difficulty);
    controller.flip();
    expect(latest.snapshot.canRing).toBe(true);
  }

  test.each(difficulties)('$difficulty leaves time to read the cards before the computer flips', ({ difficulty, flipDelay }) => {
    controller.start({ nickname: 'Player', avatarId: 'bell' }, difficulty);
    controller.flip();
    expect(latest.snapshot.turn).toBe('B');

    jest.advanceTimersByTime(flipDelay - 1);
    expect(latest.snapshot.players.B.playedCount).toBe(0);
    jest.advanceTimersByTime(1);
    expect(latest.snapshot.players.B.playedCount).toBe(1);
    expect(latest.snapshot.turn).toBe('A');
  });

  test.each(difficulties)('$difficulty gives the player the full reaction window before a computer ring', ({ difficulty, ringDelay }) => {
    startWithRingOpportunity(difficulty);

    jest.advanceTimersByTime(ringDelay - 1);
    expect(latest.snapshot.lastRingEvent).toBeNull();
    jest.advanceTimersByTime(1);
    expect(latest.snapshot.lastRingEvent).toMatchObject({ caller: 'B', outcome: 'correct' });
  });

  test('a normal player can collect the cards after 700 ms without a stale computer ring', () => {
    startWithRingOpportunity('normal');
    jest.advanceTimersByTime(700);
    controller.ring();

    expect(latest.lastActionResult).toMatchObject({ accepted: true, outcome: 'correct' });
    expect(latest.snapshot.lastRingEvent).toMatchObject({ caller: 'A', outcome: 'correct' });
    jest.advanceTimersByTime(150);
    expect(latest.snapshot.ringHistory).toHaveLength(1);
    expect(latest.snapshot.lastRingEvent?.caller).toBe('A');
  });
});
