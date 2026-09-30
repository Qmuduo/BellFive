import { create } from 'zustand';
import {
  createGame,
  flipCard,
  restartGame as restartGameEngine,
  ringBell,
} from '../game/engine';
import type { RingResult } from '../game/engine';
import type { GameState, PlayerId } from '../game/types';

type GameStore = {
  game: GameState | null;
  startGame: () => void;
  restartGame: () => void;
  flip: () => void;
  flipForPlayer: (player: PlayerId) => void;
  ringForPlayer: (player: PlayerId) => RingResult | null;
};

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  startGame: () => set({ game: createGame() }),
  restartGame: () => set({ game: restartGameEngine() }),
  flip: () => {
    const game = get().game;
    if (!game || game.status !== 'playing') return;

    set({ game: flipCard(game) });
  },
  flipForPlayer: player => {
    const game = get().game;
    if (!game || game.status !== 'playing' || game.turn !== player) return;

    set({ game: flipCard(game) });
  },
  ringForPlayer: player => {
    const game = get().game;
    if (!game || game.status !== 'playing') return null;

    const result = ringBell(game, player);
    set({ game: result.state });
    return result;
  },
}));
