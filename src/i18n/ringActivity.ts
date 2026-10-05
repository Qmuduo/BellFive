import type { RingFeedbackEvent } from '../network/protocol';
import type { PlayerId } from '../game/types';
import type { Language } from './types';
import { translate } from './translations';

export function formatRingActivity(
  event: RingFeedbackEvent,
  localPlayerId: PlayerId,
  language: Language = 'zh-CN',
  opponentName?: string,
): string {
  const isLocalCaller = event.caller === localPlayerId;
  const callerName = !isLocalCaller && opponentName
    ? opponentName
    : translate(language, event.caller === 'A' ? 'ring.seatA' : 'ring.seatB');
  const count = event.movedCardCount;
  const cardWord = translate(language, count === 1 ? 'deck.cardWord.one' : 'deck.cardWord.many');

  if (event.outcome === 'correct') {
    return isLocalCaller
      ? translate(language, count === 0 ? 'ring.correct.ownEmpty' : 'ring.correct.own', { count, cardWord })
      : translate(language, count === 0 ? 'ring.correct.otherEmpty' : 'ring.correct.other', { count, cardWord, playerLabel: callerName });
  }
  return isLocalCaller
    ? translate(language, count === 0 ? 'ring.wrong.ownEmpty' : 'ring.wrong.own', { count, cardWord })
    : translate(language, count === 0 ? 'ring.wrong.otherEmpty' : 'ring.wrong.other', { count, cardWord, playerLabel: callerName });
}
