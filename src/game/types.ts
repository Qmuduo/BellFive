export const FRUIT_TYPES = [
  'banana',
  'grape',
  'pear',
  'strawberry',
  'peach',
] as const;

export type FruitType = (typeof FRUIT_TYPES)[number];

export const GAME_ELEMENTS = [...FRUIT_TYPES, 'bell'] as const;

export type GameElement = (typeof GAME_ELEMENTS)[number];
export type PlayerId = 'A' | 'B';
export type RingOutcome = 'correct' | 'wrong';
export type GameStatus = 'playing' | 'finished';

export type CardDefinition = Readonly<{
  id: string;
  symbols: readonly GameElement[];
}>;

export type PlayerState = Readonly<{
  drawPile: readonly CardDefinition[];
  playedPile: readonly CardDefinition[];
}>;

export type VisibleCounts = Readonly<
  Record<FruitType, number> & { wildBellCount: number }
>;

export type GameState = Readonly<{
  status: GameStatus;
  turn: PlayerId;
  winner: PlayerId | null;
  players: Readonly<Record<PlayerId, PlayerState>>;
  lastRingOutcome: RingOutcome | null;
}>;
