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
