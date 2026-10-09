import type { MiniGameWxApi } from './wxApi';

export interface KeyboardFocus {
  value: string;
  maxLength?: number;
  onInput(value: string): void;
  onConfirm?(value: string): void;
  onCancel?(): void;
}
export interface KeyboardAdapter { focus(input: KeyboardFocus): void; blur(): void; dispose(): void; }

export function createWxKeyboard(api: Pick<MiniGameWxApi,
  'showKeyboard' | 'hideKeyboard' | 'onKeyboardInput' | 'offKeyboardInput'
  | 'onKeyboardConfirm' | 'offKeyboardConfirm' | 'onKeyboardComplete' | 'offKeyboardComplete'>): KeyboardAdapter {
  let focused: KeyboardFocus | undefined;
  let disposed = false;
  const blur = () => {
    focused = undefined;
    try { api.hideKeyboard({}); } catch { /* Unavailable keyboard must not block navigation. */ }
  };
  const input = (result: WechatMinigame.OnKeyboardInputListenerResult) => focused?.onInput(result.value);
  const confirm = (result: WechatMinigame.OnKeyboardInputListenerResult) => {
    const current = focused;
    focused = undefined;
    current?.onConfirm?.(result.value);
  };
  const complete = () => { const current = focused; focused = undefined; current?.onCancel?.(); };
  api.onKeyboardInput(input); api.onKeyboardConfirm(confirm); api.onKeyboardComplete(complete);
  return {
    focus(next) {
      if (disposed) return;
      focused = next;
      const fail = () => { if (focused === next) { focused = undefined; next.onCancel?.(); } };
      try {
        api.showKeyboard({ defaultValue: next.value, maxLength: next.maxLength ?? 128, multiple: false,
          confirmHold: false, confirmType: 'done', keyboardType: 'text', fail });
      } catch { fail(); }
    },
    blur,
    dispose() {
      if (disposed) return;
      disposed = true; blur();
      api.offKeyboardInput(input); api.offKeyboardConfirm(confirm); api.offKeyboardComplete(complete);
    },
  };
}
