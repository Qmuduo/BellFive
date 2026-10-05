import Taro from '@tarojs/taro';
import type { SocketHandlers, SocketLike } from '../../../src/network/GameClient';

export function createTaroSocket(url: string): SocketLike {
  const taskPromise = Taro.connectSocket({ url });
  let task: Awaited<ReturnType<typeof Taro.connectSocket>> | null = null;
  let handlers: SocketHandlers | null = null;
  let closed = false;
  let listenersAttached = false;
  let connectionFailed = false;
  let errorReported = false;

  const reportConnectionError = () => {
    if (handlers && connectionFailed && !errorReported) {
      errorReported = true;
      handlers.onError();
    }
  };

  const attachListeners = () => {
    if (!task || !handlers || listenersAttached) return;
    listenersAttached = true;
    task.onOpen(() => handlers?.onOpen());
    task.onMessage(event => {
      if (typeof event.data === 'string') handlers?.onMessage(event.data);
    });
    task.onClose(event => handlers?.onClose(event.code));
    task.onError(() => handlers?.onError());
  };

  void taskPromise.then(socketTask => {
    task = socketTask;
    if (closed) {
      task.close({});
      return;
    }
    attachListeners();
  }).catch(() => {
    connectionFailed = true;
    reportConnectionError();
  });

  return {
    setHandlers(nextHandlers) {
      handlers = nextHandlers;
      attachListeners();
      reportConnectionError();
    },
    send(message) {
      if (!closed) task?.send({ data: message });
    },
    close() {
      closed = true;
      task?.close({});
    },
  };
}
