import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from '@/src/i18n/en.json';
import zhHK from '@/src/i18n/zh-HK.json';

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';
const defaultLanguage = deviceLanguage === 'zh' ? 'zh-HK' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-HK': { translation: zhHK },
  },
  lng: defaultLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export const changeLanguage = (lang: 'en' | 'zh-HK') => {
  return i18n.changeLanguage(lang);
};

export default i18n;
export { useTranslation } from 'react-i18next';
