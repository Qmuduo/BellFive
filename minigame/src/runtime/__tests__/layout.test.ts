/** @jest-environment node */
import { clipTapTargetsToContent, hitTest, layoutForScreen, logicalPoint } from '../layout';
import { ScreenNavigation } from '../navigation';
import { CanvasRuntime } from '../canvas';

test('drawn primary rectangle is the hit target within the portrait safe area', () => {
  const layout = layoutForScreen(390, 844, { top: 44, bottom: 34 });
  expect(layout.content).toEqual({ x: 0, y: 44, width: 390, height: 766 });
  expect(layout.primaryButton).toEqual({ x: 24, y: 730, width: 342, height: 56 });
  expect(layout.targets.find(target => target.id === 'primary')!.rect).toBe(layout.primaryButton);
  expect(hitTest({ x: 195, y: 740 }, layout.targets)).toBe('primary');
  expect(hitTest({ x: 2, y: 2 }, layout.targets)).toBeNull();
});

test('hit testing uses half-open boundaries and the top enabled target', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };
  const targets = [{ id: 'under', rect }, { id: 'over', rect }, { id: 'disabled', rect, enabled: false }];
  expect(hitTest({ x: 10, y: 20 }, targets)).toBe('over');
  expect(hitTest({ x: 39.99, y: 59.99 }, targets)).toBe('over');
  expect(hitTest({ x: 40, y: 30 }, targets)).toBeNull();
  expect(hitTest({ x: 15, y: 60 }, targets)).toBeNull();
  expect(hitTest({ x: NaN, y: 30 }, targets)).toBeNull();
});

test.each([[320, 568], [430, 932], [180, 260]])('cards and controls remain within %sx%s content', (width, height) => {
  const { content, cards, primaryButton, secondaryButton } = layoutForScreen(width, height, { top: 20, bottom: 10, left: 4, right: 6 });
  for (const rect of [...cards, primaryButton, secondaryButton]) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeGreaterThanOrEqual(content.x);
    expect(rect.y).toBeGreaterThanOrEqual(content.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(content.x + content.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(content.y + content.height);
  }
});

test('device coordinates are divided once while native logical coordinates are preserved', () => {
  expect(logicalPoint({ x: 585, y: 2220 }, 3, 'device')).toEqual({ x: 195, y: 740 });
  expect(logicalPoint({ x: 195, y: 740 }, 3, 'logical')).toEqual({ x: 195, y: 740 });
  expect(() => layoutForScreen(0, 844, { top: 0, bottom: 0 })).toThrow();
});

test('tap targets retain only their visible intersection with safe content', () => {
  const targets = [
    { id: 'above', rect: { x: 20, y: 0, width: 20, height: 30 } },
    { id: 'partial', rect: { x: 0, y: 35, width: 50, height: 30 } },
    { id: 'below', rect: { x: 20, y: 110, width: 20, height: 20 } },
  ];
  expect(clipTapTargetsToContent(targets, { x: 10, y: 40, width: 100, height: 60 })).toEqual([
    { id: 'partial', rect: { x: 10, y: 40, width: 40, height: 25 } },
  ]);
});

function runtimeFixture(scrollContentHeight?: number) {
  const events = new Map<string, (event?: any) => void>();
  const frames = new Map<number, (time: number) => void>();
  const detached: string[] = [];
  const transforms: number[][] = [];
  const canvas = { width: 0, height: 0 };
  const context = { setTransform: (...values: number[]) => transforms.push(values), clearRect: () => {} };
  let id = 0;
  let viewport = { width: 390, height: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 34 } };
  const platform = {
    canvas, context, getViewport: () => viewport,
    requestFrame: (callback: (time: number) => void) => { frames.set(++id, callback); return id; },
    cancelFrame: (frame: number) => { frames.delete(frame); },
    subscribe: (name: string, listener: (event?: any) => void) => {
      if (events.has(name)) throw new Error('duplicate event registration');
      events.set(name, listener);
      return () => { events.delete(name); detached.push(name); };
    },
  };
  const actions: string[] = [];
  const rendered: string[] = [];
  const scrollOffsets: number[] = [];
  const lifecycle: string[] = [];
  let storeListener: (() => void) | undefined;
  const store = { subscribe: (listener: () => void) => { storeListener = listener; return () => { storeListener = undefined; }; } };
  const navigation = new ScreenNavigation('home');
  const screen = (name: string) => ({
    ...(scrollContentHeight === undefined ? {} : { scrollContentHeight: () => scrollContentHeight }),
    render: (_context: unknown, layout: ReturnType<typeof layoutForScreen>) => {
      rendered.push(name);
      scrollOffsets.push(layout.scrollY);
      return [...layout.targets, { id: 'unsafe', rect: { x: 0, y: 0, width: 40, height: 40 } }];
    },
    onAction: (action: string) => actions.push(`${name}:${action}`),
    onBack: () => lifecycle.push(`${name}:back`),
    onHide: () => lifecycle.push(`${name}:hide`),
  });
  const keyboard = { focus: jest.fn(), blur: jest.fn(), dispose: jest.fn() };
  const runtime = new CanvasRuntime({ platform, navigation, screens: { home: screen('home'), account: screen('account') }, stores: [store], keyboard });
  const frame = () => {
    const entry = frames.entries().next().value!;
    frames.delete(entry[0]); entry[1](100);
  };
  const touch = (name: string, x = 195, y = 740, identifier = 1, space = 'logical') => events.get(name)?.({ points: [{ identifier, x, y }], space });
  return { runtime, events, frames, detached, canvas, transforms, actions, rendered, scrollOffsets, lifecycle, keyboard, navigation, frame, touch,
    changeStore: () => storeListener?.(), resize: () => { viewport = { ...viewport, width: 430 }; events.get('resize')?.(); },
  };
}

test('runtime registers once, renders at DPR, and coalesces store redraws into animation frames', () => {
  const f = runtimeFixture();
  expect(f.events.size).toBe(8);
  expect(f.canvas).toEqual({ width: 1170, height: 2532 });
  expect(f.transforms).toEqual([[3, 0, 0, 3, 0, 0]]);
  f.changeStore(); f.changeStore();
  expect(f.frames.size).toBe(1);
  f.frame();
  expect(f.rendered).toEqual(['home']);
  expect(f.frames.size).toBe(1);
  f.runtime.destroy();
  expect(f.events.size).toBe(0);
  expect(f.frames.size).toBe(0);
  f.changeStore();
  expect(f.frames.size).toBe(0);
});

test('touch dispatch ignores duplicates, unsafe touches, cancelled gestures and pre-navigation targets', () => {
  const f = runtimeFixture(); f.frame();
  f.touch('touchstart'); f.touch('touchend'); f.touch('touchend');
  expect(f.actions).toEqual(['home:primary']);
  f.touch('touchstart', 2, 2); f.touch('touchend', 2, 2);
  f.touch('touchstart'); f.touch('touchcancel'); f.touch('touchend');
  f.touch('touchstart'); f.runtime.navigate('account'); f.touch('touchend');
  expect(f.actions).toEqual(['home:primary']);
  f.frame();
  f.touch('touchstart', 585, 2220, 2, 'device'); f.touch('touchend', 585, 2220, 2, 'device');
  expect(f.actions).toEqual(['home:primary', 'account:primary']);
  f.runtime.destroy();
});

test('a store redraw does not cancel a tap already in progress', () => {
  const f = runtimeFixture(); f.frame();
  f.touch('touchstart');
  f.changeStore();
  f.touch('touchend');
  expect(f.actions).toEqual(['home:primary']);
  f.runtime.destroy();
});

test('resize invalidates gestures and hide cancels frames while show restores rendering', () => {
  const f = runtimeFixture(); f.frame(); f.touch('touchstart'); f.resize(); f.touch('touchend');
  expect(f.actions).toEqual([]);
  expect(f.canvas.width).toBe(1290);
  expect(f.transforms).toHaveLength(2);
  f.events.get('back')!();
  f.events.get('hide')!();
  expect(f.lifecycle).toEqual(['home:back', 'home:hide']);
  expect(f.frames.size).toBe(0);
  f.events.get('show')!(); f.frame();
  expect(f.rendered).toEqual(['home', 'home']);
  f.runtime.focusInput({ value: '', onInput: () => {} });
  expect(f.keyboard.focus).toHaveBeenCalledTimes(1);
  f.runtime.navigate('account');
  expect(f.keyboard.blur).toHaveBeenCalled();
  f.runtime.destroy(); f.runtime.destroy();
  expect(f.keyboard.dispose).toHaveBeenCalledTimes(1);
  expect(f.detached).toHaveLength(8);
});

test('scrolling clamps to content bounds and releases without dispatching a tap', () => {
  const f = runtimeFixture(900); f.frame();
  f.touch('touchstart', 195, 740);
  f.touch('touchmove', 195, 700);
  f.frame();
  expect(f.scrollOffsets.at(-1)).toBe(40);
  f.touch('touchmove', 195, 100);
  f.frame();
  expect(f.scrollOffsets.at(-1)).toBe(134);
  f.touch('touchend', 195, 100);
  expect(f.actions).toEqual([]);
  f.touch('touchstart', 195, 740);
  f.touch('touchmove', 195, 749);
  f.frame();
  expect(f.scrollOffsets.at(-1)).toBe(125);
  f.touch('touchend', 195, 749);
  expect(f.actions).toEqual([]);
  f.runtime.destroy();
});

test('movement within six logical pixels remains a tap and redraw keeps the active gesture', () => {
  const f = runtimeFixture(900); f.frame();
  f.touch('touchstart'); f.touch('touchmove', 195, 735);
  f.changeStore(); f.frame(); f.touch('touchend');
  expect(f.actions).toEqual(['home:primary']);
  expect(f.scrollOffsets.at(-1)).toBe(0);
  f.runtime.destroy();
});

test('scroll offsets are retained per screen while navigation cancels the current drag', () => {
  const f = runtimeFixture(900); f.frame();
  f.touch('touchstart'); f.touch('touchmove', 195, 700); f.frame();
  f.runtime.navigate('account'); f.touch('touchend', 195, 700); f.frame();
  expect(f.scrollOffsets.at(-1)).toBe(0);
  f.runtime.navigate('home'); f.frame();
  expect(f.scrollOffsets.at(-1)).toBe(40);
  expect(f.actions).toEqual([]);
  f.runtime.destroy();
});

test('navigation history is separate and observable with back at the root remaining stable', () => {
  const navigation = new ScreenNavigation('home');
  const changes: string[] = [];
  const stop = navigation.subscribe(() => changes.push(navigation.current));
  navigation.back(); navigation.navigate('account'); navigation.navigate('account'); navigation.back(); stop(); navigation.navigate('lobby');
  expect(changes).toEqual(['account', 'home']);
  expect(navigation.current).toBe('lobby');
});
