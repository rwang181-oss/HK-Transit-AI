import { Pressable, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/src/utils/i18n';
import { COLORS } from '@/src/utils/constants';

export default function TabLayout() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const toggleLang = () => {
    const next = lang === 'en' ? 'zh-HK' : 'en';
    changeLanguage(next);
  };

  return (
    <Tabs
      key={lang} // force full re-render on language change
      screenOptions={{
        tabBarActiveTintColor: COLORS.hkRed,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.bgCard,
          borderTopColor: '#E5E5EA',
        },
        headerStyle: { backgroundColor: COLORS.bgSystem },
        headerTitleStyle: {
          color: COLORS.textPrimary,
          fontSize: 22,
          fontWeight: '600',
        },
        headerRight: () => (
          <Pressable
            onPress={toggleLang}
            style={{ paddingHorizontal: 16 }}
          >
            <Text style={{ fontSize: 16, color: COLORS.hkRed }}>
              {lang === 'en' ? '中文' : 'EN'}
            </Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('journey.title'), tabBarLabel: t('journey.title') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('search.title'), tabBarLabel: t('search.title') }}
      />
      <Tabs.Screen
        name="nearby"
        options={{ title: t('nearby.title'), tabBarLabel: t('nearby.title') }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('favorites.title'), tabBarLabel: t('favorites.title') }}
      />
    </Tabs>
  );
}
