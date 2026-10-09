import type { SocketHandlers, SocketLike } from '../../../src/network/GameClient';
import type { MiniGameWxApi } from './wxApi';

export function createWxSocket(api: Pick<MiniGameWxApi, 'connectSocket'>, url: string): SocketLike {
  let handlers: SocketHandlers | undefined;
  let closing = false;
  let closed = false;
  const pending: ((handlers: SocketHandlers) => void)[] = [];
  const emit = (event: (handlers: SocketHandlers) => void) => handlers ? event(handlers) : pending.push(event);
  const error = () => { if (!closed) emit(current => current.onError()); };
  const task = api.connectSocket({ url, fail: error });
  task.onOpen(() => { if (!closing) emit(current => current.onOpen()); });
  task.onMessage(result => {
    if (closing || closed) return;
    if (typeof result.data === 'string') emit(current => current.onMessage(result.data as string));
    else error();
  });
  task.onError(error);
  task.onClose(result => {
    if (closed) return;
    closed = true;
    emit(current => current.onClose(result.code));
  });
  return {
    setHandlers(next) { handlers = next; for (const event of pending.splice(0)) event(next); },
    send(message) {
      if (closing || closed) return;
      try { task.send({ data: message, fail: error }); } catch { error(); }
    },
    close() {
      if (closing || closed) return;
      closing = true;
      try { task.close({ code: 1000, reason: 'Client closed', fail: error }); } catch { error(); }
    },
  };
}
