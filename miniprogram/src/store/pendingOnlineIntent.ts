export type PendingOnlineIntent =
  | Readonly<{ type: 'create-room' }>
  | Readonly<{ type: 'open-lobby' }>
  | Readonly<{ type: 'join-room'; roomCode: string }>;

export type PendingOnlineIntentState = Readonly<{
  pendingIntent: PendingOnlineIntent | null;
  pending: boolean;
  errorCode: string | null;
}>;

export type PendingOnlineIntentFlow = Readonly<{
  getState: () => PendingOnlineIntentState;
  subscribe: (listener: (state: PendingOnlineIntentState) => void) => () => void;
  begin: (intent: PendingOnlineIntent) => Promise<void>;
  retry: () => Promise<void>;
  clear: () => void;
}>;

function getErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'NETWORK_ERROR';
}

export function createPendingOnlineIntent(
  authorize: () => Promise<void>,
  resume: (intent: PendingOnlineIntent) => void,
): PendingOnlineIntentFlow {
  let state: PendingOnlineIntentState = { pendingIntent: null, pending: false, errorCode: null };
  let generation = 0;
  const listeners = new Set<(next: PendingOnlineIntentState) => void>();
  const publish = (next: PendingOnlineIntentState) => {
    state = next;
    listeners.forEach(listener => listener(state));
  };

  const run = async (runGeneration: number) => {
    const intent = state.pendingIntent;
    if (!intent || state.pending || runGeneration !== generation) return;
    publish({ ...state, pending: true, errorCode: null });
    try {
      await authorize();
      if (generation !== runGeneration || state.pendingIntent !== intent) return;
      resume(intent);
      publish({ pendingIntent: null, pending: false, errorCode: null });
    } catch (error) {
      if (generation === runGeneration && state.pendingIntent === intent) {
        publish({ ...state, pending: false, errorCode: getErrorCode(error) });
      }
    }
  };

  return {
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    begin: async intent => {
      if (state.pending) return;
      generation += 1;
      publish({ pendingIntent: intent, pending: false, errorCode: null });
      await run(generation);
    },
    retry: async () => {
      if (!state.pendingIntent || state.pending) return;
      await run(generation);
    },
    clear: () => {
      generation += 1;
      publish({ pendingIntent: null, pending: false, errorCode: null });
    },
  };
}
