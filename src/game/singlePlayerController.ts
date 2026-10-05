import {
  canPlayerRing,
  createGame,
  finishGameByTimeout,
  flipCard,
  ringBell,
} from './engine';
import { canRing, countVisibleItems } from './rules';
import type { GameState, PlayerId } from './types';
import { sanitizePlayerProfile } from '../profile';
import type { PlayerProfile, PlayerProfileInput } from '../profile';
import { createRoomSnapshot } from '../network/protocol';
import type {
  FlipFeedbackEvent,
  RingFeedbackEvent,
  RoomSnapshot,
  RoomSnapshotSource,
  ServerMessage,
} from '../network/protocol';

export type SinglePlayerDifficulty = 'easy' | 'normal' | 'hard';
export type SinglePlayerActionResult = Extract<ServerMessage, { type: 'action.result' }>;

export type SinglePlayerUpdate = Readonly<{
  snapshot: RoomSnapshot;
  lastActionResult: SinglePlayerActionResult | null;
}>;

export type SinglePlayerControllerOptions = Readonly<{
  onUpdate: (update: SinglePlayerUpdate) => void;
}>;

type DifficultySettings = Readonly<{
  flipDelayMs: number;
  correctRingDelayMs: number;
  falseRingChance: number;
}>;

type AiRingPlan = Readonly<{
  tableVersion: number;
  outcome: 'correct' | 'wrong' | null;
  pending: boolean;
}>;

const DIFFICULTY_SETTINGS: Readonly<Record<SinglePlayerDifficulty, DifficultySettings>> = {
  easy: { flipDelayMs: 1100, correctRingDelayMs: 900, falseRingChance: 0.2 },
  normal: { flipDelayMs: 750, correctRingDelayMs: 550, falseRingChance: 0.08 },
  hard: { flipDelayMs: 420, correctRingDelayMs: 250, falseRingChance: 0.02 },
};

const MATCH_LENGTH_SECONDS = 5 * 60;

export class SinglePlayerController {
  private game: GameState | null = null;
  private profile: PlayerProfile | null = null;
  private difficulty: SinglePlayerDifficulty = 'normal';
  private remainingSeconds = MATCH_LENGTH_SECONDS;
  private deadline = 0;
  private generation = 0;
  private actionRevision = 0;
  private actionSequence = 0;
  private tableVersion = 0;
  private flipVersion = 0;
  private ringVersion = 0;
  private lastFlipEvent: FlipFeedbackEvent | null = null;
  private lastRingEvent: RingFeedbackEvent | null = null;
  private ringHistory: RingFeedbackEvent[] = [];
  private lastActionResult: SinglePlayerActionResult | null = null;
  private aiRingPlan: AiRingPlan | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SinglePlayerControllerOptions) {}

  start(profile: PlayerProfileInput, difficulty: SinglePlayerDifficulty): void {
    this.clearTimers();
    this.generation += 1;
    this.actionRevision = 0;
    this.actionSequence = 0;
    this.profile = sanitizePlayerProfile(profile, 'A');
    this.difficulty = difficulty;
    this.game = createGame();
    this.remainingSeconds = MATCH_LENGTH_SECONDS;
    this.deadline = Date.now() + MATCH_LENGTH_SECONDS * 1000;
    this.tableVersion = 0;
    this.flipVersion = 0;
    this.ringVersion = 0;
    this.lastFlipEvent = null;
    this.lastRingEvent = null;
    this.ringHistory = [];
    this.lastActionResult = null;
    this.aiRingPlan = null;
    this.publish();
    this.countdownTimer = setInterval(() => this.tickCountdown(), 1000);
  }

  flip(): void {
    this.tickCountdown();
    const game = this.game;
    if (!game || game.status !== 'playing' || game.turn !== 'A') {
      this.recordRejectedAction();
      return;
    }

    this.applyFlip('A');
  }

  ring(): void {
    this.tickCountdown();
    const game = this.game;
    if (!game || game.status !== 'playing' || !canPlayerRing(game, 'A')) {
      this.recordRejectedAction();
      return;
    }

    this.applyRing('A');
  }

  rematch(): void {
    if (!this.profile) return;
    this.start(this.profile, this.difficulty);
  }

  stop(): void {
    this.clearTimers();
    this.generation += 1;
    this.actionRevision += 1;
    this.game = null;
    this.profile = null;
    this.aiRingPlan = null;
  }

  private applyFlip(player: PlayerId): void {
    const currentGame = this.game;
    if (!currentGame || currentGame.status !== 'playing') return;

    this.clearAiTimer();
    this.actionRevision += 1;
    const hadCard = currentGame.players[player].drawPile.length > 0;
    this.game = flipCard(currentGame);

    if (hadCard) {
      this.tableVersion += 1;
      this.flipVersion += 1;
      this.lastFlipEvent = { version: this.flipVersion, player };
    }

    if (player === 'A') {
      this.lastActionResult = this.makeActionResult({ accepted: true });
    }
    this.onGameTransition();
  }

  private applyRing(player: PlayerId): void {
    const currentGame = this.game;
    if (!currentGame || currentGame.status !== 'playing' || !canPlayerRing(currentGame, player)) return;

    this.clearAiTimer();
    this.actionRevision += 1;
    const result = ringBell(currentGame, player);
    this.game = result.state;
    this.ringVersion += 1;
    const event: RingFeedbackEvent = {
      version: this.ringVersion,
      caller: player,
      outcome: result.outcome,
      movedCardCount: result.movedCardCount,
    };
    this.lastRingEvent = event;
    this.ringHistory = [...this.ringHistory, event].slice(-12);
    if (result.outcome === 'correct') this.tableVersion += 1;

    if (player === 'A') {
      this.lastActionResult = this.makeActionResult({
        accepted: true,
        outcome: result.outcome,
        movedCardCount: result.movedCardCount,
      });
    }
    if (player === 'B' && this.aiRingPlan?.tableVersion === this.tableVersion) {
      this.aiRingPlan = { ...this.aiRingPlan, pending: false };
    }
    this.onGameTransition();
  }

  private onGameTransition(): void {
    if (!this.game) return;
    if (this.game.status === 'finished') {
      this.clearTimers();
    }
    this.publish();
    if (this.game.status === 'playing') this.scheduleAiResponse();
  }

  private scheduleAiResponse(): void {
    const game = this.game;
    if (!game || game.status !== 'playing' || this.aiTimer !== null) return;

    const settings = DIFFICULTY_SETTINGS[this.difficulty];
    if (this.aiRingPlan?.tableVersion !== this.tableVersion) {
      const mayRing = canPlayerRing(game, 'B');
      const correctNow = mayRing && canRing(countVisibleItems(game));
      const wrongNow = mayRing && !correctNow && Math.random() < settings.falseRingChance;
      this.aiRingPlan = {
        tableVersion: this.tableVersion,
        outcome: correctNow ? 'correct' : wrongNow ? 'wrong' : null,
        pending: correctNow || wrongNow,
      };
    }

    const plan = this.aiRingPlan;
    if (plan?.pending && plan.outcome) {
      this.scheduleAiAction(
        'ring',
        settings.correctRingDelayMs,
        plan.tableVersion,
        plan.outcome,
      );
      return;
    }

    if (game.turn === 'B') {
      this.scheduleAiAction('flip', settings.flipDelayMs, this.tableVersion);
    }
  }

  private scheduleAiAction(
    action: 'flip' | 'ring',
    delayMs: number,
    expectedTableVersion: number,
    ringOutcome?: 'correct' | 'wrong',
  ): void {
    const generation = this.generation;
    const actionRevision = this.actionRevision;
    const expectedTurn = this.game?.turn ?? null;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.tickCountdown();
      const game = this.game;
      if (
        generation !== this.generation ||
        actionRevision !== this.actionRevision ||
        !game ||
        game.status !== 'playing' ||
        this.tableVersion !== expectedTableVersion ||
        game.turn !== expectedTurn
      ) {
        return;
      }

      if (action === 'ring') {
        const plan = this.aiRingPlan;
        if (!plan || !plan.pending || plan.outcome !== ringOutcome || !canPlayerRing(game, 'B')) return;
        const correctNow = canRing(countVisibleItems(game));
        if ((ringOutcome === 'correct') !== correctNow) {
          this.aiRingPlan = null;
          this.scheduleAiResponse();
          return;
        }
        this.aiRingPlan = { ...plan, pending: false };
        this.applyRing('B');
        return;
      }

      if (game.turn === 'B') this.applyFlip('B');
    }, delayMs);
  }

  private tickCountdown(): void {
    const game = this.game;
    if (!game || game.status !== 'playing') return;

    const nextSeconds = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
    if (nextSeconds === this.remainingSeconds) return;
    this.remainingSeconds = nextSeconds;
    if (nextSeconds === 0) {
      this.game = finishGameByTimeout(game);
      this.actionRevision += 1;
      this.clearTimers();
    }
    this.publish();
  }

  private recordRejectedAction(): void {
    this.lastActionResult = this.makeActionResult({ accepted: false });
    this.publish();
  }

  private makeActionResult(
    result: Omit<SinglePlayerActionResult, 'type' | 'actionId'>,
  ): SinglePlayerActionResult {
    this.actionSequence += 1;
    return {
      type: 'action.result',
      actionId: `solo-${this.generation}-${this.actionSequence}`,
      ...result,
    };
  }

  private createSnapshot(): RoomSnapshot {
    const game = this.game;
    const profile = this.profile;
    if (!game || !profile) throw new Error('Cannot project a solo match without an active game and profile.');

    const source: RoomSnapshotSource = {
      roomCode: '',
      phase: game.status === 'playing' ? 'playing' : 'finished',
      game,
      connected: { A: true, B: true },
      profiles: { A: profile, B: { nickname: '', avatarId: 'bell' } },
      tableVersion: this.tableVersion,
      ringVersion: this.ringVersion,
      remainingSeconds: this.remainingSeconds,
      lastRingEvent: this.lastRingEvent,
      lastFlipEvent: this.lastFlipEvent,
      ready: { A: false, B: false },
      ringHistory: this.ringHistory,
    };
    return createRoomSnapshot(source, 'A');
  }

  private publish(): void {
    if (!this.game || !this.profile) return;
    this.options.onUpdate({
      snapshot: this.createSnapshot(),
      lastActionResult: this.lastActionResult,
    });
  }

  private clearAiTimer(): void {
    if (this.aiTimer === null) return;
    clearTimeout(this.aiTimer);
    this.aiTimer = null;
  }

  private clearTimers(): void {
    this.clearAiTimer();
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
