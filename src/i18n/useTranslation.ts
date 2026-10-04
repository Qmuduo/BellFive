import { useMemo } from 'react';
import { translate } from './translations';
import type { TranslationKey } from './translations';
import type { TranslationParams } from './types';
import { useSettingsStore } from '../store/settingsStore';

export function useTranslation() {
  const language = useSettingsStore(state => state.language);
  const t = useMemo(
    () => (key: TranslationKey, params?: TranslationParams) => translate(language, key, params),
    [language],
  );
  return { language, t } as const;
}
