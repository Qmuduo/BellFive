import { createStore } from 'zustand/vanilla';
import type { AvatarId } from '../../../src/profile';
import type { KeyboardAdapter } from '../platform/keyboard';

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

export type OnlineIntent = Readonly<{ type: 'create-room' } | { type: 'open-lobby' } | { type: 'join-room'; roomCode: string }>;
export type AccountMode = 'menu' | 'profile' | 'login' | 'register' | 'credentials' | 'link' | 'reset';
export type InputField = 'username' | 'password' | 'nickname' | 'roomCode';
export interface MiniGameAppState {
  readonly pendingIntent: OnlineIntent | null;
  readonly onlineBusy: boolean;
  readonly accountBusy: boolean;
  readonly errorCode: string | null;
  readonly notice: string | null;
  readonly accountMode: AccountMode;
  readonly confirmTransfer: boolean;
  readonly avatarId: AvatarId;
  readonly lobbyPage: number;
  readonly fields: Readonly<Record<InputField, string>>;
}

/** Forms and intents live in memory only; credentials never enter persisted stores. */
export function createMiniGameApp(keyboard?: KeyboardAdapter) {
  const state = createStore<MiniGameAppState>(() => ({
    pendingIntent: null, onlineBusy: false, accountBusy: false, errorCode: null, notice: null,
    accountMode: 'menu', confirmTransfer: false, avatarId: 'strawberry', lobbyPage: 0,
    fields: { username: '', password: '', nickname: '', roomCode: '' },
  }));
  const navigation = new ScreenNavigation('home');
  let intentGeneration = 0;
  const clearPasswords = () => {
    state.setState(current => ({ fields: { ...current.fields, password: '' } }));
    keyboard?.blur();
  };
  const clearIntent = () => { intentGeneration++; state.setState({ pendingIntent: null, onlineBusy: false, errorCode: null }); };
  const stopNavigation = navigation.subscribe(clearPasswords);
  return {
    navigation, getState: state.getState, subscribe: state.subscribe, update: state.setState,
    setField(field: InputField, value: string) { state.setState(current => ({ fields: { ...current.fields, [field]: value } })); },
    focusField(field: InputField) {
      const setValue = (value: string) => state.setState(current => ({ fields: { ...current.fields, [field]: value } }));
      keyboard?.focus({ value: field === 'password' ? '' : state.getState().fields[field],
        maxLength: field === 'nickname' ? 48 : field === 'roomCode' ? 12 : field === 'username' ? 24 : 128,
        onInput: setValue, onConfirm: setValue,
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
