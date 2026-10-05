import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';

type MusicToggleProps = Readonly<{
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}>;

export function MusicToggle({ enabled, disabled = false, onToggle }: MusicToggleProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(enabled ? 'music.turnOff' : 'music.turnOn')}
      accessibilityState={{ checked: enabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.button, enabled && styles.enabled, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.icon, enabled && styles.iconEnabled]}>♫</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D7C9E8', borderRadius: 11, backgroundColor: '#FFFFFF' },
  enabled: { backgroundColor: '#E3FB88', borderColor: '#CEE57D' },
  disabled: { opacity: 0.55 },
  icon: { color: '#796887', fontSize: 17, fontWeight: '800' },
  iconEnabled: { color: '#2F194C' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
});
