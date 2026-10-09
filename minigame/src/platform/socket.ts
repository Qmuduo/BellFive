import type { SocketHandlers, SocketLike } from '../../../src/network/GameClient';
import type { MiniGameWxApi } from './wxApi';

export function createWxSocket(api: Pick<MiniGameWxApi, 'connectSocket'>, url: string): SocketLike {
  let handlers: SocketHandlers | undefined;
  let closing = false;
  let closed = false;
  let task: WechatMinigame.SocketTask | undefined;
  const pending: ((handlers: SocketHandlers) => void)[] = [];
  const emit = (event: (handlers: SocketHandlers) => void) => handlers ? event(handlers) : pending.push(event);
  const error = () => { if (!closing && !closed) emit(current => current.onError()); };
  const terminate = (code: number, reportError = false) => {
    if (closed) return;
    closed = true;
    if (reportError) emit(current => current.onError());
    emit(current => current.onClose(code));
  };
  const releaseFailedTask = () => {
    try { task?.close({ code: 1000, reason: 'Transport failed', fail: () => {} }); } catch { /* Already terminal. */ }
  };
  const fail = () => {
    if (closed) return;
    terminate(closing ? 1000 : 1006, !closing);
    if (!closing) releaseFailedTask();
  };
  task = api.connectSocket({ url, fail });
  task.onOpen(() => { if (!closing && !closed) emit(current => current.onOpen()); });
  task.onMessage(result => {
    if (closing || closed) return;
    if (typeof result.data === 'string') emit(current => current.onMessage(result.data as string));
    else error();
  });
  task.onError(error);
  task.onClose(result => terminate(result.code));
  // A native fail callback can run before connectSocket returns its task.
  if (closed) releaseFailedTask();
  return {
    setHandlers(next) { handlers = next; for (const event of pending.splice(0)) event(next); },
    send(message) {
      if (closing || closed) return;
      try { task!.send({ data: message, fail }); } catch { fail(); }
    },
    close() {
      if (closing || closed) return;
      closing = true;
      try { task!.close({ code: 1000, reason: 'Client closed', fail }); } catch { fail(); }
    },
  };
}
