import { createMiniAccountActionGate } from '../accountActionGate';

test('blocks account mutations during auth work and serializes preflight actions', () => {
  const gate = createMiniAccountActionGate();

  expect(gate.tryBegin(true)).toBe(false);
  expect(gate.isBusy()).toBe(false);

  expect(gate.tryBegin(false)).toBe(true);
  expect(gate.isBusy()).toBe(true);
  expect(gate.tryBegin(false)).toBe(false);

  gate.finish();
  expect(gate.isBusy()).toBe(false);
  expect(gate.tryBegin(false)).toBe(true);
});
