import {
  formatApplicationStatus,
  formatGameError,
  playerSeatLabel,
  translate,
  translations,
} from '..';
import { getPlayerDisplayName } from '../../profile';

describe('BellFive translations', () => {
  it('provides matching, non-empty copy for Chinese and English', () => {
    const chineseKeys = Object.keys(translations['zh-CN']).sort();
    const englishKeys = Object.keys(translations.en).sort();

    expect(chineseKeys).toEqual(englishKeys);
    for (const key of chineseKeys as Array<keyof typeof translations.en>) {
      expect(translations['zh-CN'][key].trim()).not.toBe('');
      expect(translations.en[key].trim()).not.toBe('');
    }
  });

  it('formats localized copy with dynamic values', () => {
    expect(translate('zh-CN', 'waiting.shareMessage', { roomCode: 'ABCD23' })).toContain('ABCD23');
    expect(translate('en', 'waiting.shareMessage', { roomCode: 'ABCD23' })).toContain('ABCD23');
    expect(translate('zh-CN', 'ring.correct.own', { count: 6 })).toBe('拍铃正确，获得 6 张牌');
    expect(translate('en', 'ring.correct.own', { count: 6, cardWord: 'cards' })).toBe('Correct ring — you collect 6 cards');
  });

  it('localizes seat labels, application status and known errors', () => {
    expect(playerSeatLabel('A', 'zh-CN')).toBe('玩家 1');
    expect(playerSeatLabel('B', 'en')).toBe('Player B');
    expect(getPlayerDisplayName({ nickname: 'Mira', avatarId: 'pear' }, 'A', 'zh-CN')).toBe('Mira · 玩家 1');
    expect(getPlayerDisplayName({ nickname: '', avatarId: 'pear' }, 'B', 'zh-CN')).toBe('玩家 2');
    expect(getPlayerDisplayName({ nickname: 'Player A', avatarId: 'pear' }, 'A', 'zh-CN')).toBe('Player A · 玩家 1');
    expect(getPlayerDisplayName({ nickname: 'Player B', avatarId: 'pear' }, 'B', 'zh-CN')).toBe('Player B · 玩家 2');
    expect(getPlayerDisplayName({ nickname: 'Player A', avatarId: 'pear' }, 'A', 'en')).toBe('Player A · Player A');
    expect(getPlayerDisplayName({ nickname: '玩家 1', avatarId: 'pear' }, 'A', 'zh-CN')).toBe('玩家 1 · 玩家 1');
    expect(formatApplicationStatus('zh-CN', 'pending')).toBe('加入申请已发送，等待房主审批。');
    expect(formatApplicationStatus('en', 'room_full')).toBe('That room is full.');
    expect(formatGameError('zh-CN', 'ROOM_NOT_FOUND')).toBe('房间已关闭或不存在，请返回大厅。');
    expect(formatGameError('en', 'ROOM_NOT_FOUND')).toBe('That room is closed or no longer exists. Return to the lobby.');
  });

  it('uses a localized generic message for unknown errors', () => {
    expect(formatGameError('zh-CN', 'UNRECOGNIZED_CODE')).toBe('发生了错误，请稍后重试。');
    expect(formatGameError('en', 'UNRECOGNIZED_CODE')).toBe('Something went wrong. Please try again.');
  });
});
