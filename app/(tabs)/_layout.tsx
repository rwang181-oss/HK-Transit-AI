import { Pressable, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/src/utils/i18n';
import { COLORS } from '@/src/utils/constants';

export default function TabLayout() {
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'zh-HK' : 'en';
    changeLanguage(next);
  };

  return (
    <Tabs
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
              {i18n.language === 'en' ? '中文' : 'EN'}
            </Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('home.title'), tabBarLabel: 'Home' }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('search.title'), tabBarLabel: 'Search' }}
      />
      <Tabs.Screen
        name="nearby"
        options={{ title: t('nearby.title'), tabBarLabel: 'Nearby' }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('favorites.title'), tabBarLabel: 'Favorites' }}
      />
    </Tabs>
  );
}
