import type { SafeAreaInsets } from '../runtime/layout';

// Type-only compatibility for the shared GameClient's default browser socket factory.
// Mini Game callers inject createWxSocket; no browser global or runtime polyfill is created.
declare global {
  const WebSocket: {
    new(url: string): {
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onclose: ((event: { code: number }) => void) | null;
      onerror: (() => void) | null;
      send(data: string): void;
      close(): void;
    };
  };
}

export type MiniGameWxApi = Pick<typeof wx,
  | 'login' | 'request' | 'connectSocket' | 'getStorage' | 'setStorage' | 'removeStorage'
  | 'showKeyboard' | 'hideKeyboard' | 'onKeyboardInput' | 'offKeyboardInput'
  | 'onKeyboardConfirm' | 'offKeyboardConfirm' | 'onKeyboardComplete' | 'offKeyboardComplete'
  | 'createInnerAudioContext' | 'vibrateShort' | 'shareAppMessage'
  | 'createCanvas' | 'getSystemInfoSync' | 'getMenuButtonBoundingClientRect' | 'onTouchStart' | 'offTouchStart' | 'onTouchMove' | 'offTouchMove'
  | 'onTouchEnd' | 'offTouchEnd' | 'onTouchCancel' | 'offTouchCancel'
  | 'onWindowResize' | 'offWindowResize' | 'onHide' | 'offHide' | 'onShow' | 'offShow'
  | 'onKeyDown' | 'offKeyDown'> & Partial<Pick<typeof wx, 'createUserInfoButton'>>;

// Mini Game typings expose the native 2D rendering context through getContext.
export type CanvasContext2D = ReturnType<WechatMinigame.Canvas['getContext']>;
export interface Viewport { width: number; height: number; pixelRatio: number; safeArea: SafeAreaInsets; menuButton?: { x: number; y: number; width: number; height: number }; }
export interface TouchPoint { identifier: number; x: number; y: number; }
export interface TouchInput { points: readonly TouchPoint[]; space: 'logical' | 'device'; }
export type RuntimeEvent = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel' | 'resize' | 'back' | 'hide' | 'show';
export interface FrameScheduler {
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(handle: number): void;
}
export interface CanvasPlatform extends FrameScheduler {
  canvas: Pick<WechatMinigame.Canvas, 'width' | 'height'>;
  context: CanvasContext2D;
  getViewport(): Viewport;
  subscribe(event: RuntimeEvent, listener: (event?: TouchInput) => void): () => void;
}

type RuntimeWxApi = Pick<MiniGameWxApi,
  | 'createCanvas' | 'getSystemInfoSync' | 'onTouchStart' | 'offTouchStart' | 'onTouchMove' | 'offTouchMove'
  | 'onTouchEnd' | 'offTouchEnd' | 'onTouchCancel' | 'offTouchCancel'
  | 'onWindowResize' | 'offWindowResize' | 'onHide' | 'offHide' | 'onShow' | 'offShow'
  | 'onKeyDown' | 'offKeyDown'> & Partial<Pick<MiniGameWxApi, 'getMenuButtonBoundingClientRect'>>;

export function createWxRuntimePlatform(api: RuntimeWxApi, scheduler: FrameScheduler = {
  requestFrame: callback => requestAnimationFrame(callback),
  cancelFrame: handle => cancelAnimationFrame(handle),
}): CanvasPlatform {
  const canvas = api.createCanvas();
  const context = canvas.getContext('2d');
  return {
    canvas, context, ...scheduler,
    getViewport() {
      const info = api.getSystemInfoSync();
      const area = info.safeArea;
      let menuButton: Viewport['menuButton'];
      try {
        const rect = api.getMenuButtonBoundingClientRect?.();
        if (rect) {
          const width = Number.isFinite(rect.width) ? rect.width : rect.right - rect.left;
          const height = Number.isFinite(rect.height) ? rect.height : rect.bottom - rect.top;
          const x = Number.isFinite(rect.left) ? rect.left : rect.right - width;
          const y = Number.isFinite(rect.top) ? rect.top : rect.bottom - height;
          if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
            menuButton = { x, y, width, height };
          }
        }
      } catch { /* Older base libraries may not expose the native menu-button bounds. */ }
      if (!menuButton) {
        // Mini Game DevTools can expose this API but return undefined. Reserve a
        // conservative 96×40 logical-pixel band at the safe-area top-right.
        const width = Math.min(96, info.windowWidth * 0.55);
        const y = Math.min(info.windowHeight, area?.top ?? 0);
        menuButton = { x: Math.max(0, info.windowWidth - width), y, width,
          height: Math.min(40, Math.max(0, info.windowHeight - y)) };
      }
      return { width: info.windowWidth, height: info.windowHeight, pixelRatio: info.pixelRatio,
        safeArea: { top: area?.top ?? 0, bottom: area ? Math.max(0, info.windowHeight - area.bottom) : 0,
          left: area?.left ?? 0, right: area ? Math.max(0, info.windowWidth - area.right) : 0 },
        ...(menuButton ? { menuButton } : {}),
      };
    },
    subscribe(event, listener) {
      const touch = (input: WechatMinigame.OnTouchStartListenerResult) => listener({
        points: input.changedTouches.map(point => ({ identifier: point.identifier, x: point.clientX, y: point.clientY })),
        // Native wx clientX/clientY are logical screen coordinates, independent of Canvas DPR.
        space: 'logical',
      });
      const simple = () => listener();
      const back = (input: WechatMinigame.OnKeyDownListenerResult) => {
        if (input.key === 'Escape' || input.key === 'BrowserBack') listener();
      };
      switch (event) {
        case 'touchstart': api.onTouchStart(touch); return () => api.offTouchStart(touch);
        case 'touchmove': api.onTouchMove(touch); return () => api.offTouchMove(touch);
        case 'touchend': api.onTouchEnd(touch); return () => api.offTouchEnd(touch);
        case 'touchcancel': api.onTouchCancel(touch); return () => api.offTouchCancel(touch);
        case 'resize': api.onWindowResize(simple); return () => api.offWindowResize(simple);
        case 'hide': api.onHide(simple); return () => api.offHide(simple);
        case 'show': api.onShow(simple); return () => api.offShow(simple);
        case 'back': api.onKeyDown(back); return () => api.offKeyDown(back);
      }
    },
  };
}
