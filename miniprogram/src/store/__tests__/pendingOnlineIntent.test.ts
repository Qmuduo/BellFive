import { createPendingOnlineIntent } from '../pendingOnlineIntent';

test('retains a room-code intent after WeChat login fails and retries that same action', async () => {
  const authorize = jest.fn<Promise<void>, []>()
    .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }))
    .mockResolvedValueOnce(undefined);
  const resume = jest.fn();
  const flow = createPendingOnlineIntent(authorize, resume);
  const intent = { type: 'join-room' as const, roomCode: 'ABCD23' };

  await flow.begin(intent);
  expect(flow.getState()).toMatchObject({ pendingIntent: intent, pending: false, errorCode: 'NETWORK_ERROR' });
  expect(resume).not.toHaveBeenCalled();

  await flow.retry();
  expect(resume).toHaveBeenCalledWith(intent);
  expect(flow.getState()).toMatchObject({ pendingIntent: null, pending: false, errorCode: null });
});

test('keeps guest actions independent from a failed pending online login', async () => {
  const flow = createPendingOnlineIntent(async () => { throw new Error('login unavailable'); }, jest.fn());
  await flow.begin({ type: 'create-room' });

  expect(flow.getState().pendingIntent).toEqual({ type: 'create-room' });
  flow.clear();
  expect(flow.getState().pendingIntent).toBeNull();
});

test('does not resume an online action until authorization has succeeded', async () => {
  let finishAuthorization!: () => void;
  const authorize = () => new Promise<void>(resolve => { finishAuthorization = resolve; });
  const resume = jest.fn();
  const flow = createPendingOnlineIntent(authorize, resume);

  const running = flow.begin({ type: 'open-lobby' });
  expect(flow.getState().pending).toBe(true);
  expect(resume).not.toHaveBeenCalled();
  finishAuthorization();
  await running;

  expect(resume).toHaveBeenCalledWith({ type: 'open-lobby' });
});
