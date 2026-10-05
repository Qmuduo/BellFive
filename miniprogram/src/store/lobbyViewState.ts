import type { GameClientStatus } from '../../../src/network/GameClient';

export type MiniLobbyViewState = 'sign-in' | 'loading' | 'syncing' | 'empty' | 'rooms';

export function getMiniLobbyViewState(input: Readonly<{
  authenticated: boolean;
  connectionStatus: GameClientStatus;
  snapshotReceived: boolean;
  roomCount: number;
}>): MiniLobbyViewState {
  if (!input.authenticated) return 'sign-in';
  if (input.connectionStatus !== 'connected') return 'loading';
  if (!input.snapshotReceived) return 'syncing';
  return input.roomCount > 0 ? 'rooms' : 'empty';
}
