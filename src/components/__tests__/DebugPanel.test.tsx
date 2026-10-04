import { act, render, screen } from '@testing-library/react-native';
import type { RoomSnapshot } from '../../network/protocol';
import { useSettingsStore } from '../../store/settingsStore';
import { DebugPanel } from '../DebugPanel';

describe('DebugPanel localization', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh-CN', hydrated: true });
  });

  it('shows translated labels and updates when the device language changes', async () => {
    await render(<DebugPanel snapshot={makeSnapshot()} connectionStatus="connected" />);

    expect(screen.getByText('调试信息')).toBeOnTheScreen();
    expect(screen.getByText('玩家 1抽牌堆：29')).toBeOnTheScreen();
    expect(screen.getByText('可以抢铃：否')).toBeOnTheScreen();
    expect(screen.getByText('玩家 1按铃受限：否')).toBeOnTheScreen();
    expect(screen.getByText('香蕉: 3')).toBeOnTheScreen();

    await act(async () => {
      useSettingsStore.getState().setLanguage('en');
    });

    expect(screen.getByText('DEBUG')).toBeOnTheScreen();
    expect(screen.getByText('Player A draw pile: 29')).toBeOnTheScreen();
    expect(screen.getByText('Can Ring: false')).toBeOnTheScreen();
    expect(screen.getByText('Ring blocked Player A: false')).toBeOnTheScreen();
    expect(screen.getByText('banana: 3')).toBeOnTheScreen();
  });
});

function makeSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD23',
    phase: 'playing',
    localPlayerId: 'A',
    players: {
      A: { connected: true, drawCount: 29, playedCount: 1, topCard: null, profile: { nickname: 'Mira', avatarId: 'pear' } },
      B: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: 'Kai', avatarId: 'banana' } },
    },
    turn: 'B',
    winner: null,
    lastRingOutcome: null,
    visibleCounts: { banana: 3, grape: 0, pear: 0, strawberry: 0, peach: 0, wildBellCount: 0 },
    canRing: false,
    tableVersion: 1,
    remainingSeconds: 300,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
    lastFlipEvent: null,
    ready: { A: true, B: true },
    ringHistory: [],
  };
}
