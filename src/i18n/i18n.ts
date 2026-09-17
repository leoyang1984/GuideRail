import { useEffect, useState } from 'react';
import {
  LANGUAGE_SETTING_KEY,
  getEffectiveLocale,
  setGlobalLanguageSetting,
  t,
  type LanguageSetting,
  type TranslationKey,
} from './core';

export * from './core';

export function useI18n() {
  const [setting, setSetting] = useState<LanguageSetting>('auto');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
      void chrome.storage.local.get(LANGUAGE_SETTING_KEY).then(res => {
        const val = res?.[LANGUAGE_SETTING_KEY] as LanguageSetting | undefined;
        if (val && ['auto', 'en', 'zh'].includes(val)) {
          setSetting(val);
          setGlobalLanguageSetting(val);
        }
      }).catch(() => {});
    }
  }, []);

  const changeSetting = (next: LanguageSetting) => {
    setSetting(next);
    setGlobalLanguageSetting(next);
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.set) {
      void chrome.storage.local.set({ [LANGUAGE_SETTING_KEY]: next });
    }
  };

  const locale = getEffectiveLocale(setting);

  return {
    locale,
    setting,
    setLanguage: changeSetting,
    t: (key: TranslationKey, params?: Record<string, string | number>) => t(key, params, locale),
  };
}
