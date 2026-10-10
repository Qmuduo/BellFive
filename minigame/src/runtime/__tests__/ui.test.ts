/** @jest-environment node */
import type { CanvasContext2D } from '../../platform/wxApi';
import type { Rect } from '../layout';
import {
  drawAvatarBadge,
  drawCanvasButton,
  drawDivider,
  drawInputField,
  drawRoundedPanel,
  drawStatusBadge,
} from '../ui';

function createContext(): CanvasContext2D {
  const fillColors: string[] = [];
  return {
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), quadraticCurveTo: jest.fn(), closePath: jest.fn(),
    fill: jest.fn(function(this: { fillStyle: string }) { fillColors.push(this.fillStyle); }), stroke: jest.fn(), fillRect: jest.fn(), strokeRect: jest.fn(), arc: jest.fn(),
    save: jest.fn(), restore: jest.fn(), fillText: jest.fn(), setTransform: jest.fn(), clearRect: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), rect: jest.fn(), clip: jest.fn(), measureText: jest.fn(() => ({ width: 10 })),
    draw: jest.fn(), __fillColors: fillColors,
  } as unknown as CanvasContext2D;
}

const rect: Rect = { x: 10, y: 20, width: 100, height: 40 };

test('rounded panels build a quadratic-corner path and fill before outlining', () => {
  const context = createContext();
  drawRoundedPanel(context, rect, { fill: '#FFFFFF', border: '#D7C9E8', radius: 8, borderWidth: 2 });
  expect(context.moveTo).toHaveBeenCalledWith(18, 20);
  expect(context.quadraticCurveTo).toHaveBeenNthCalledWith(4, 10, 20, 18, 20);
  expect(context.fillStyle).toBe('#FFFFFF');
  expect(context.strokeStyle).toBe('#D7C9E8');
  expect(context.lineWidth).toBe(2);
  expect(context.fill).toHaveBeenCalledTimes(1);
  expect(context.stroke).toHaveBeenCalledTimes(1);
});

test('divider aligns its stroke to a device pixel', () => {
  const context = createContext();
  drawDivider(context, { x: 4, y: 10, width: 30, height: 1 }, '#D7C9E8');
  expect(context.moveTo).toHaveBeenCalledWith(4, 10.5);
  expect(context.lineTo).toHaveBeenCalledWith(34, 10.5);
  expect(context.strokeStyle).toBe('#D7C9E8');
});

test('disabled buttons mute their fill and label and return the painted hit rectangle', () => {
  const context = createContext();
  const target = drawCanvasButton(context, rect, 'Join', { variant: 'primary', enabled: false, fontSize: 16, radius: 16 });
  expect(target).toBe(rect);
  expect(context.fillStyle).toBe('#796887');
  expect(context.textAlign).toBe('center');
  expect(context.textBaseline).toBe('middle');
  expect(context.fillText).toHaveBeenCalledWith('Join', 60, 40);
});

test('focused input fields align their label and value to separate regions', () => {
  const context = createContext();
  drawInputField(context, rect, 'Room code', 'AB12', { focused: true, enabled: true, fontSize: 14, radius: 12 });
  expect(context.textAlign).toBe('left');
  expect(context.fillText).toHaveBeenNthCalledWith(1, 'Room code', 22, 31.200000000000003);
  expect(context.fillText).toHaveBeenNthCalledWith(2, 'AB12', 22, 48.8);
  expect(context.strokeStyle).toBe('#7040C4');
});

test('status badges select the error palette and avatar badges draw the supplied emoji', () => {
  const context = createContext();
  drawStatusBadge(context, rect, 'Offline', 'error');
  expect((context as CanvasContext2D & { __fillColors: string[] }).__fillColors).toContain('#7040C4');
  expect(context.strokeStyle).toBe('#7040C4');
  expect(context.fillText).toHaveBeenCalledWith('Offline', 60, 40);

  drawAvatarBadge(context, rect, '🐼', { background: '#E3FB88', foreground: '#34214F', fontSize: 20, radius: 20 });
  expect(context.arc).toHaveBeenCalledWith(60, 40, 20, 0, Math.PI * 2);
  expect(context.fillText).toHaveBeenCalledWith('🐼', 60, 40);
});
