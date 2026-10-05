import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Language } from '../i18n/types';
import { useTranslation } from '../i18n/useTranslation';
import { useSettingsStore } from '../store/settingsStore';
import { gameColors } from '../theme/gameColors';

const OPTIONS: readonly Language[] = ['zh-CN', 'en'];

export function LanguageSettings({ compact = false }: Readonly<{ compact?: boolean }>) {
  const [visible, setVisible] = useState(false);
  const { language, t } = useTranslation();
  const setLanguage = useSettingsStore(state => state.setLanguage);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.open')}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.trigger, compact && styles.compactTrigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerText}>{language === 'zh-CN' ? '中 / EN' : 'EN / 中'}</Text>
      </Pressable>
      <Modal
        animationType="fade"
        transparent
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text style={styles.title}>{t('settings.title')}</Text>
            {OPTIONS.map(option => {
              const label = t(option === 'zh-CN' ? 'settings.chinese' : 'settings.english');
              const selected = language === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setLanguage(option);
                    setVisible(false);
                  }}
                  style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
                >
                  <Text style={[styles.optionText, selected && styles.selectedText]}>{label}</Text>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>{t('settings.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minWidth: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 8, borderWidth: 1, borderColor: gameColors.border, borderRadius: 14, backgroundColor: gameColors.surface },
  compactTrigger: { minWidth: 42, paddingHorizontal: 5 },
  triggerText: { color: gameColors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(52, 33, 79, 0.38)' },
  dialog: { width: '100%', maxWidth: 340, padding: 19, borderRadius: 24, backgroundColor: gameColors.surface, shadowColor: gameColors.plum, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  title: { marginBottom: 13, color: gameColors.plum, fontSize: 18, fontWeight: '900' },
  option: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: gameColors.border, borderRadius: 15, backgroundColor: gameColors.lavenderSurface },
  selected: { borderColor: gameColors.purple, backgroundColor: gameColors.lime },
  optionText: { color: gameColors.ink, fontSize: 14, fontWeight: '700' },
  selectedText: { color: gameColors.plum, fontWeight: '900' },
  check: { color: gameColors.purple, fontSize: 17, fontWeight: '900' },
  close: { alignItems: 'center', justifyContent: 'center', minHeight: 45, marginTop: 12, borderRadius: 14, backgroundColor: gameColors.purple },
  closeText: { color: gameColors.onDark, fontSize: 13, fontWeight: '900' },
});
