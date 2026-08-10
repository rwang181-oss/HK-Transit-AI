export type AppLanguage = 'en' | 'zh-HK';

export function nextLanguage(language: AppLanguage): AppLanguage {
  return language === 'en' ? 'zh-HK' : 'en';
}

export function languageSwitchLabel(language: AppLanguage): '繁中' | 'EN' {
  return language === 'en' ? '繁中' : 'EN';
}
