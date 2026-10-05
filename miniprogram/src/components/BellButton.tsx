import { Button, Text } from '@tarojs/components';
import { useState } from 'react';
import type { RingOutcome } from '../../../src/game/types';

export type BellButtonProps = Readonly<{
  disabled: boolean;
  onPress: () => void;
  outcome?: RingOutcome | null;
  feedbackVersion?: number;
  label?: string;
}>;

export function BellButton({ disabled, onPress, outcome = null, feedbackVersion = 0, label = '按铃' }: BellButtonProps): JSX.Element {
  const [pressed, setPressed] = useState(false);
  const outcomeClass = outcome ? ` bell-feedback-${outcome}` : '';
  return (
    <Button
      key={feedbackVersion}
      className={`mini-bell-button ${disabled ? 'mini-bell-disabled' : ''}${pressed ? ' mini-bell-pressed' : ''}${outcomeClass}`}
      disabled={disabled}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onClick={onPress}
    >
      <Text className="mini-bell-icon">🔔</Text>
      <Text className="mini-bell-label">{label}</Text>
    </Button>
  );
}
