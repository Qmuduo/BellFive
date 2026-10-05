export type MiniAccountActionGate = Readonly<{
  isBusy: () => boolean;
  tryBegin: (authPending: boolean) => boolean;
  finish: () => void;
}>;

export function createMiniAccountActionGate(): MiniAccountActionGate {
  let busy = false;
  return {
    isBusy: () => busy,
    tryBegin: authPending => {
      if (authPending || busy) return false;
      busy = true;
      return true;
    },
    finish: () => { busy = false; },
  };
}
