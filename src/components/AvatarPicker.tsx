import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AVATAR_EMOJI, AVATAR_OPTIONS } from '../profile';
import type { AvatarId } from '../profile';

type AvatarPickerProps = Readonly<{
  selected: AvatarId;
  onSelect: (avatarId: AvatarId) => void;
  disabled?: boolean;
}>;

export function AvatarPicker({ selected, onSelect, disabled = false }: AvatarPickerProps) {
  return (
    <View style={styles.options}>
      {AVATAR_OPTIONS.map(avatarId => {
        const isSelected = selected === avatarId;
        return (
          <Pressable
            key={avatarId}
            role="button"
            accessibilityLabel={`${avatarId} avatar`}
            accessibilityState={{ selected: isSelected, disabled }}
            disabled={disabled}
            onPress={() => onSelect(avatarId)}
            style={({ pressed }) => [styles.option, isSelected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <Text style={styles.emoji}>{AVATAR_EMOJI[avatarId]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  option: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1.5, borderColor: '#E5E4E0', backgroundColor: '#FFFFFF' },
  selected: { borderColor: '#D6B533', backgroundColor: '#FFF5CC' },
  pressed: { transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.55 },
  emoji: { fontSize: 22 },
});
