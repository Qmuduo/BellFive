import { CARD_DEFINITIONS } from '../cards';
import {
  createGame,
  canPlayerRing,
  finishGameByTimeout,
  flipCard,
  restartGame,
  ringBell,
  shuffleDeck,
  transferPenaltyCards,
  checkWinner,
} from '../engine';
import type { CardDefinition, GameElement, GameState, PlayerId } from '../types';

const makeCard = (id: string, symbols: readonly GameElement[]): CardDefinition => ({
  id,
  symbols,
});

const makeState = (
  playerA: { drawPile: readonly CardDefinition[]; playedPile: readonly CardDefinition[] },
  playerB: { drawPile: readonly CardDefinition[]; playedPile: readonly CardDefinition[] },
  turn: PlayerId = 'A',
): GameState => ({
  status: 'playing',
  turn,
  winner: null,
  ringBlockedUntilFlip: { A: false, B: false },
  lastRingOutcome: null,
  players: { A: playerA, B: playerB },
});

describe('deck setup and flips', () => {
  it('shuffles deterministically without losing, duplicating, or mutating cards', () => {
    const originalIds = CARD_DEFINITIONS.map(card => card.id);
    const firstShuffle = shuffleDeck(CARD_DEFINITIONS, () => 0);
    const secondShuffle = shuffleDeck(CARD_DEFINITIONS, () => 0);

    expect(firstShuffle.map(card => card.id)).toEqual(secondShuffle.map(card => card.id));
    expect(firstShuffle.map(card => card.id).sort()).toEqual([...originalIds].sort());
    expect(firstShuffle.map(card => card.id)).not.toEqual(originalIds);
    expect(CARD_DEFINITIONS.map(card => card.id)).toEqual(originalIds);
  });

  it('deals every fixed card once into two 30-card piles and starts with Player A', () => {
    const game = createGame(() => 0);
    const dealtIds = [
      ...game.players.A.drawPile.map(card => card.id),
      ...game.players.B.drawPile.map(card => card.id),
    ];

    expect(game.status).toBe('playing');
    expect(game.turn).toBe('A');
    expect(game.winner).toBeNull();
    expect(game.ringBlockedUntilFlip).toEqual({ A: false, B: false });
    expect(game.players.A.drawPile).toHaveLength(30);
    expect(game.players.B.drawPile).toHaveLength(30);
    expect(game.players.A.playedPile).toEqual([]);
    expect(game.players.B.playedPile).toEqual([]);
    expect(dealtIds.sort()).toEqual(CARD_DEFINITIONS.map(card => card.id).sort());
  });

  it('moves each turn top card to its played-pile top without mutating prior state', () => {
    const [aTop, aNext, aOldTop, bTop] = CARD_DEFINITIONS;
    const original = makeState(
      { drawPile: [aTop, aNext], playedPile: [aOldTop] },
      { drawPile: [bTop], playedPile: [] },
    );

    const afterAFlip = flipCard(original);

    expect(afterAFlip.players.A.drawPile).toEqual([aNext]);
    expect(afterAFlip.players.A.playedPile).toEqual([aTop, aOldTop]);
    expect(afterAFlip.turn).toBe('B');
    expect(original.players.A.drawPile).toEqual([aTop, aNext]);
    expect(original.players.A.playedPile).toEqual([aOldTop]);

    const afterBFlip = flipCard(afterAFlip);

    expect(afterBFlip.players.B.drawPile).toEqual([]);
    expect(afterBFlip.players.B.playedPile).toEqual([bTop]);
    expect(afterBFlip.turn).toBe('A');
  });

  it('restarts with a fresh shuffled 30/30 deal and empty played piles', () => {
    const restarted = restartGame(() => 0);

    expect(restarted.status).toBe('playing');
    expect(restarted.turn).toBe('A');
    expect(restarted.winner).toBeNull();
    expect(restarted.lastRingOutcome).toBeNull();
    expect(restarted.players.A.drawPile).toHaveLength(30);
    expect(restarted.players.B.drawPile).toHaveLength(30);
    expect(restarted.players.A.playedPile).toEqual([]);
    expect(restarted.players.B.playedPile).toEqual([]);
  });
});

describe('ring and pile transitions', () => {
  it('collects both entire played piles to the caller draw-pile bottom on a correct ring', () => {
    const aDrawTop = makeCard('A-draw-top', ['banana']);
    const aDrawBottom = makeCard('A-draw-bottom', ['grape']);
    const bDrawTop = makeCard('B-draw-top', ['pear']);
    const aVisible = makeCard('A-visible', ['strawberry', 'strawberry', 'strawberry']);
    const aHidden = makeCard('A-hidden', ['peach']);
    const bVisible = makeCard('B-visible', ['strawberry', 'bell']);
    const bHidden = makeCard('B-hidden', ['banana']);
    const original = makeState(
      { drawPile: [aDrawTop, aDrawBottom], playedPile: [aVisible, aHidden] },
      { drawPile: [bDrawTop], playedPile: [bVisible, bHidden] },
      'A',
    );

    const result = ringBell(original, 'B');

    expect(result.outcome).toBe('correct');
    expect(result.movedCardCount).toBe(4);
    expect(result.state.players.B.drawPile).toEqual([
      bDrawTop,
      aVisible,
      aHidden,
      bVisible,
      bHidden,
    ]);
    expect(result.state.players.A.playedPile).toEqual([]);
    expect(result.state.players.B.playedPile).toEqual([]);
    expect(result.state.turn).toBe('A');
    expect(result.state.lastRingOutcome).toBe('correct');
    expect(original.players.B.drawPile).toEqual([bDrawTop]);
    expect(original.players.A.playedPile).toEqual([aVisible, aHidden]);
  });

  it.each([
    { available: 0, moved: 0 },
    { available: 1, moved: 1 },
    { available: 2, moved: 1 },
    { available: 3, moved: 1 },
  ])(
    'transfers at most one caller card when $available are available',
    ({ available, moved }) => {
      const callerCards = CARD_DEFINITIONS.slice(0, available);
      const opponentCard = CARD_DEFINITIONS[10];
      const state = makeState(
        { drawPile: callerCards, playedPile: [makeCard('A-top', ['banana'])] },
        { drawPile: [opponentCard], playedPile: [makeCard('B-top', ['pear'])] },
        'B',
      );

      const result = transferPenaltyCards(state, 'A');

      expect(result.movedCardCount).toBe(moved);
      expect(result.state.players.A.drawPile).toEqual(callerCards.slice(moved));
      expect(result.state.players.B.drawPile).toEqual([
        opponentCard,
        ...callerCards.slice(0, moved),
      ]);
      expect(result.state.turn).toBe('B');
      expect(state.players.A.drawPile).toEqual(callerCards);
    },
  );

  it('marks an invalid caller ring wrong and keeps the already-selected turn', () => {
    const state = makeState(
      {
        drawPile: CARD_DEFINITIONS.slice(0, 3),
        playedPile: [makeCard('A-top', ['banana'])],
      },
      {
        drawPile: [],
        playedPile: [makeCard('B-top', ['pear'])],
      },
      'B',
    );

    const result = ringBell(state, 'A');

    expect(result.outcome).toBe('wrong');
    expect(result.movedCardCount).toBe(1);
    expect(result.state.players.A.drawPile).toEqual(CARD_DEFINITIONS.slice(1, 3));
    expect(result.state.players.B.drawPile).toEqual(CARD_DEFINITIONS.slice(0, 1));
    expect(result.state.turn).toBe('B');
    expect(result.state.lastRingOutcome).toBe('wrong');
    expect(canPlayerRing(result.state, 'A')).toBe(false);
    expect(canPlayerRing(result.state, 'B')).toBe(true);
  });

  it('unblocks a false ringer after that player successfully flips their next card', () => {
    const state = makeState(
      { drawPile: CARD_DEFINITIONS.slice(0, 3), playedPile: [makeCard('A-top', ['banana'])] },
      { drawPile: CARD_DEFINITIONS.slice(3, 5), playedPile: [makeCard('B-top', ['pear'])] },
      'B',
    );
    const afterWrongRing = ringBell(state, 'A').state;
    const afterBFlip = flipCard(afterWrongRing);
    const afterANextFlip = flipCard(afterBFlip);

    expect(canPlayerRing(afterWrongRing, 'A')).toBe(false);
    expect(canPlayerRing(afterBFlip, 'A')).toBe(false);
    expect(canPlayerRing(afterANextFlip, 'A')).toBe(true);
  });

  it('counts draw and played cards for timeout scoring and draws on equal totals', () => {
    const aLeads = makeState(
      { drawPile: CARD_DEFINITIONS.slice(0, 2), playedPile: [makeCard('A-played', ['banana'])] },
      { drawPile: [CARD_DEFINITIONS[2]], playedPile: [makeCard('B-played', ['pear'])] },
    );
    const tied = makeState(
      { drawPile: [CARD_DEFINITIONS[0]], playedPile: [makeCard('A-played', ['banana'])] },
      { drawPile: [CARD_DEFINITIONS[1]], playedPile: [makeCard('B-played', ['pear'])] },
    );

    expect(finishGameByTimeout(aLeads)).toMatchObject({ status: 'finished', winner: 'A' });
    expect(finishGameByTimeout(tied)).toMatchObject({ status: 'finished', winner: null });
  });
});

describe('winner and terminal transitions', () => {
  it('plays all sixty dealt cards before ending on the empty active player', () => {
    let game = createGame(() => 0);

    for (let flip = 0; flip < 60; flip += 1) {
      game = flipCard(game);
    }

    expect(game.status).toBe('playing');
    expect(game.players.A.drawPile).toHaveLength(0);
    expect(game.players.B.drawPile).toHaveLength(0);
    expect(game.players.A.playedPile).toHaveLength(30);
    expect(game.players.B.playedPile).toHaveLength(30);

    game = flipCard(game);

    expect(game).toMatchObject({ status: 'finished', winner: 'B', turn: 'A' });
    expect([
      ...game.players.A.drawPile,
      ...game.players.A.playedPile,
      ...game.players.B.drawPile,
      ...game.players.B.playedPile,
    ]).toHaveLength(60);
  });

  it('awards the win to the opponent when the active player cannot draw', () => {
    const state = makeState(
      { drawPile: [], playedPile: [makeCard('A-visible', ['banana'])] },
      { drawPile: [makeCard('B-draw', ['pear'])], playedPile: [] },
      'A',
    );

    expect(checkWinner(state)).toBe('B');
    expect(flipCard(state)).toMatchObject({ status: 'finished', winner: 'B', turn: 'A' });
    expect(state.status).toBe('playing');
  });

  it('does not declare a winner while the active player still has a card', () => {
    const state = makeState(
      { drawPile: [makeCard('A-draw', ['banana'])], playedPile: [] },
      { drawPile: [], playedPile: [] },
      'A',
    );

    expect(checkWinner(state)).toBeNull();
    expect(flipCard(state)).toMatchObject({ status: 'playing', winner: null, turn: 'B' });
  });

  it('keeps finished matches unchanged when another flip is attempted', () => {
    const finished = {
      ...makeState(
        { drawPile: [], playedPile: [] },
        { drawPile: [makeCard('B-draw', ['pear'])], playedPile: [] },
        'A',
      ),
      status: 'finished' as const,
      winner: 'B' as const,
    };

    expect(flipCard(finished)).toBe(finished);
    expect(checkWinner(finished)).toBe('B');
  });
});
