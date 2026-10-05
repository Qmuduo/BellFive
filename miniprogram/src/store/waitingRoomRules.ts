import type { GameClientStatus } from '../../../src/network/GameClient';
import type { RoomSnapshot } from '../../../src/network/protocol';

export function canChangeMiniReady(connectionStatus: GameClientStatus, snapshot: RoomSnapshot | null): boolean {
  return connectionStatus === 'connected'
    && snapshot?.phase === 'waiting'
    && snapshot.players.A.connected
    && snapshot.players.B.connected;
}

export function canChangeMiniApplication(connectionStatus: GameClientStatus): boolean {
  return connectionStatus === 'connected';
}
