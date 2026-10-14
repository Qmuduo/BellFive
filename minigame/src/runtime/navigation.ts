import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AvatarId } from '../../../src/profile';
import type { GameStore } from '../../../src/store/createGameStoreApi';
import type { SinglePlayerDifficulty } from '../../../src/game/singlePlayerController';
import type { KeyboardAdapter } from '../platform/keyboard';
import { EMPTY_PRIVACY_FLOW, type PrivacyFlowState } from '../privacy/policy';

export class ScreenNavigation {
  private readonly history: string[];
  private readonly listeners = new Set<() => void>();
  constructor(initialScreen: string) { this.history = [initialScreen]; }
  get current(): string { return this.history[this.history.length - 1]; }
  navigate(screen: string, replace = false): void {
    if (screen === this.current) return;
    if (replace) this.history[this.history.length - 1] = screen;
    else this.history.push(screen);
    this.changed();
  }
  back(): void { if (this.history.length > 1) { this.history.pop(); this.changed(); } }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { for (const listener of this.listeners) listener(); }
}

/** Route only from authoritative shared-store sessions and snapshots. While a room is
 * being left, retain its screen until the server confirms the seat is gone. */
export function connectRoomNavigation(app: Pick<ReturnType<typeof createMiniGameApp>, 'navigation' | 'getState' | 'update'>,
  gameStore: Pick<StoreApi<GameStore>, 'getState' | 'subscribe'>): () => void {
  let hadOnlineSession = gameStore.getState().sessionMode === 'online';
  let hadSoloSession = gameStore.getState().sessionMode === 'single-player';
  let roomSessionVersion = gameStore.getState().roomSessionVersion;
  const update = () => {
    const game = gameStore.getState();
    if (game.roomSessionVersion !== roomSessionVersion) {
      roomSessionVersion = game.roomSessionVersion;
      app.update({ waitingApplicationPage: 0, pendingReadyAction: null, pendingCancelApplicationId: null });
    }
    const pendingReady = app.getState().pendingReadyAction;
    if (pendingReady && (pendingReady.roomSessionVersion !== game.roomSessionVersion
      || game.sessionMode !== 'online' || game.error?.actionId === pendingReady.actionId
      || game.connectionStatus === 'disconnected' || game.connectionStatus === 'error'
      || (game.roomSnapshot !== null && game.roomSnapshot.localPlayerId === pendingReady.playerId
        && game.roomSnapshot.ready[pendingReady.playerId] === pendingReady.desiredReady))) {
      app.update({ pendingReadyAction: null });
    }
    const pendingCancelId = app.getState().pendingCancelApplicationId;
    if (pendingCancelId && (game.localApplicationId !== pendingCancelId
      || game.localApplicationStatus?.applicationId === pendingCancelId && game.localApplicationStatus.status !== 'pending'
      || game.error !== null || game.connectionStatus === 'disconnected' || game.connectionStatus === 'error')) {
      app.update({ pendingCancelApplicationId: null });
    }
    if (game.sessionMode === 'single-player') {
      hadSoloSession = true;
      hadOnlineSession = false;
      app.navigation.navigate('solo', true);
      return;
    }
    if (game.sessionMode === 'online' && game.roomSnapshot) {
      hadSoloSession = false;
      hadOnlineSession = true;
      switch (game.roomSnapshot.phase) {
        case 'waiting': app.navigation.navigate('waiting', true); return;
        case 'playing':
        case 'finished': app.navigation.navigate('match', true); return;
        case 'connection-paused':
          if (app.navigation.current !== 'waiting' && app.navigation.current !== 'match') {
            app.navigation.navigate('waiting', true);
          }
          return;
      }
    }
    if (game.leavingRoom) { hadOnlineSession = true; return; }
    if (hadOnlineSession || hadSoloSession) {
      hadOnlineSession = false;
      hadSoloSession = false;
      app.navigation.navigate('home', true);
    }
  };
  const stop = gameStore.subscribe(update);
  update();
  return stop;
}

export type OnlineIntent = Readonly<{ type: 'create-room' } | { type: 'open-lobby' } | { type: 'join-room'; roomCode: string }>;
export type AccountMode = 'menu' | 'profile' | 'login' | 'register' | 'credentials' | 'link' | 'reset' | 'delete';
export type InputField = 'username' | 'password' | 'nickname' | 'roomCode' | 'privacyEmail' | 'guardianGrant';
export type PendingReadyAction = Readonly<{
  actionId: string;
  playerId: 'A' | 'B';
  desiredReady: boolean;
  roomSessionVersion: number;
}>;
export interface MiniGameAppState {
  readonly soloDifficulty: SinglePlayerDifficulty;
  readonly pendingIntent: OnlineIntent | null;
  readonly onlineBusy: boolean;
  readonly accountBusy: boolean;
  readonly errorCode: string | null;
  readonly notice: string | null;
  readonly accountMode: AccountMode;
  readonly confirmTransfer: boolean;
  readonly confirmDelete: boolean;
  readonly avatarId: AvatarId;
  readonly lobbyPage: number;
  readonly waitingApplicationPage: number;
  readonly pendingReadyAction: PendingReadyAction | null;
  readonly pendingCancelApplicationId: string | null;
  readonly fields: Readonly<Record<InputField, string>>;
  readonly focusedField: InputField | null;
  readonly privacy: PrivacyFlowState;
}

/** Forms and intents live in memory only; credentials never enter persisted stores. */
export function createMiniGameApp(keyboard?: KeyboardAdapter) {
  const state = createStore<MiniGameAppState>(() => ({
    soloDifficulty: 'normal',
    pendingIntent: null, onlineBusy: false, accountBusy: false, errorCode: null, notice: null,
    accountMode: 'menu', confirmTransfer: false, confirmDelete: false, avatarId: 'strawberry', lobbyPage: 0, waitingApplicationPage: 0,
    pendingReadyAction: null, pendingCancelApplicationId: null,
    fields: { username: '', password: '', nickname: '', roomCode: '', privacyEmail: '', guardianGrant: '' }, focusedField: null,
    privacy: { ...EMPTY_PRIVACY_FLOW },
  }));
  const navigation = new ScreenNavigation('home');
  let intentGeneration = 0;
  const clearPasswords = () => {
    state.setState(current => ({ fields: { ...current.fields, password: '' }, focusedField: null }));
    keyboard?.blur();
  };
  const clearIntent = () => { intentGeneration++; state.setState({ pendingIntent: null, onlineBusy: false, errorCode: null }); };
  const stopNavigation = navigation.subscribe(clearPasswords);
  return {
    navigation, getState: state.getState, subscribe: state.subscribe, update: state.setState,
    setField(field: InputField, value: string) { state.setState(current => ({ fields: { ...current.fields, [field]: value } })); },
    focusField(field: InputField) {
      state.setState(current => ({ focusedField: field,
        errorCode: current.errorCode === 'KEYBOARD_UNAVAILABLE' ? null : current.errorCode }));
      const setValue = (value: string) => state.setState(current => ({ fields: { ...current.fields, [field]: value } }));
      keyboard?.focus({ value: field === 'password' ? '' : state.getState().fields[field],
        maxLength: field === 'nickname' ? 48 : field === 'roomCode' ? 12 : field === 'username' ? 24
          : field === 'privacyEmail' ? 254 : field === 'guardianGrant' ? 128 : 128,
        onInput: setValue,
        onConfirm(value: string) { setValue(value); state.setState({ focusedField: null }); },
        onCancel: () => state.setState({ focusedField: null }),
        onFailure: () => state.setState({ errorCode: 'KEYBOARD_UNAVAILABLE', focusedField: null }),
      });
    },
    clearPasswords, clearIntent,
    beginIntent(intent: OnlineIntent) {
      const generation = ++intentGeneration;
      state.setState({ pendingIntent: intent, onlineBusy: true, errorCode: null, notice: null });
      return generation;
    },
    intentIsCurrent(generation: number) { return generation === intentGeneration; },
    dispose() { clearIntent(); clearPasswords(); stopNavigation(); },
  };
}
export type MiniGameApp = ReturnType<typeof createMiniGameApp>;
