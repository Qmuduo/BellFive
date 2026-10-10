import type { CanvasContext2D, CanvasPlatform, TouchInput, Viewport } from '../platform/wxApi';
import type { KeyboardAdapter, KeyboardFocus } from '../platform/keyboard';
import { contains, hitTest, layoutForScreen, logicalPoint, type ScreenLayout, type TapTarget } from './layout';
import { ScreenNavigation } from './navigation';

export interface CanvasScreen {
  render(context: CanvasContext2D, layout: ScreenLayout, timestamp: number): readonly TapTarget[];
  onAction?(actionId: string, runtime: CanvasRuntime): void;
  onBack?(runtime: CanvasRuntime): void;
  onHide?(runtime: CanvasRuntime): void;
}
export interface RuntimeOptions {
  platform: CanvasPlatform;
  navigation: ScreenNavigation;
  screens: Readonly<Record<string, CanvasScreen>>;
  stores?: readonly { subscribe(listener: () => void): () => void }[];
  keyboard?: KeyboardAdapter;
}

export class CanvasRuntime {
  private readonly stops: (() => void)[] = [];
  private readonly activeTouches = new Set<number>();
  private targets: readonly TapTarget[] = [];
  private viewport!: Viewport;
  private geometry!: ScreenLayout;
  private frame: number | undefined;
  private destroyed = false;
  private hidden = false;
  constructor(private readonly options: RuntimeOptions) {
    this.resize();
    const { platform, navigation } = options;
    this.stops.push(
      platform.subscribe('touchstart', event => this.startTouch(event)),
      platform.subscribe('touchend', event => this.endTouch(event)),
      platform.subscribe('touchcancel', () => this.activeTouches.clear()),
      platform.subscribe('resize', () => this.resize()),
      platform.subscribe('back', () => this.back()),
      platform.subscribe('hide', () => this.hide()),
      platform.subscribe('show', () => { this.hidden = false; this.resize(); }),
      navigation.subscribe(() => { this.invalidateTargets(); this.blurInput(); this.requestRender(); }),
      ...(options.stores ?? []).map(store => store.subscribe(() => this.requestRender())),
    );
    this.requestRender();
  }
  get layout(): ScreenLayout { return this.geometry; }
  get currentScreen(): string { return this.options.navigation.current; }
  navigate(screen: string, replace = false): void {
    if (this.destroyed) return;
    if (!this.options.screens[screen]) throw new Error('Unknown Mini Game screen.');
    this.options.navigation.navigate(screen, replace);
  }
  back(): void {
    if (this.destroyed) return;
    const screen = this.options.screens[this.currentScreen];
    if (screen?.onBack) screen.onBack(this); else this.options.navigation.back();
  }
  focusInput(input: KeyboardFocus): void { if (!this.destroyed && !this.hidden) this.options.keyboard?.focus(input); }
  blurInput(): void { this.options.keyboard?.blur(); }
  requestRender(): void {
    if (this.destroyed || this.hidden || this.frame !== undefined) return;
    this.frame = this.options.platform.requestFrame(timestamp => {
      this.frame = undefined;
      if (this.destroyed || this.hidden) return;
      const { context } = this.options.platform;
      context.clearRect(0, 0, this.viewport.width, this.viewport.height);
      this.targets = this.options.screens[this.currentScreen]?.render(context, this.geometry, timestamp) ?? [];
      this.requestRender();
    });
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelFrame(); this.invalidateTargets();
    for (const stop of this.stops.splice(0)) stop();
    this.options.keyboard?.dispose();
  }
  private invalidateTargets(): void { this.targets = []; this.activeTouches.clear(); }
  private cancelFrame(): void {
    if (this.frame !== undefined) this.options.platform.cancelFrame(this.frame);
    this.frame = undefined;
  }
  private resize(): void {
    if (this.destroyed) return;
    this.invalidateTargets();
    this.viewport = this.options.platform.getViewport();
    this.geometry = layoutForScreen(this.viewport.width, this.viewport.height, this.viewport.safeArea);
    const ratio = this.viewport.pixelRatio;
    const { canvas, context } = this.options.platform;
    canvas.width = Math.round(this.viewport.width * ratio); canvas.height = Math.round(this.viewport.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.requestRender();
  }
  private startTouch(event?: TouchInput): void {
    if (this.destroyed || this.hidden || !event) return;
    for (const point of event.points) {
      if (contains(logicalPoint(point, this.viewport.pixelRatio, event.space), this.geometry.content)) this.activeTouches.add(point.identifier);
    }
  }
  private endTouch(event?: TouchInput): void {
    if (this.destroyed || this.hidden || !event) return;
    let action: string | null = null;
    for (const point of event.points) {
      if (!this.activeTouches.delete(point.identifier)) continue;
      const logical = logicalPoint(point, this.viewport.pixelRatio, event.space);
      if (action === null && contains(logical, this.geometry.content)) action = hitTest(logical, this.targets);
    }
    if (action !== null) this.options.screens[this.currentScreen]?.onAction?.(action, this);
  }
  private hide(): void {
    if (this.destroyed || this.hidden) return;
    this.hidden = true; this.cancelFrame(); this.invalidateTargets(); this.blurInput();
    this.options.screens[this.currentScreen]?.onHide?.(this);
  }
}
