import { Pressable, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/src/utils/i18n';
import { COLORS } from '@/src/utils/constants';

function TabIcon({ symbol, active }: { symbol: string; active: boolean }) {
  return <Text style={{ fontSize: 17, opacity: active ? 1 : 0.55 }}>{symbol}</Text>;
}

export default function TabLayout() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <Tabs
      key={lang}
      screenOptions={{
        tabBarActiveTintColor: COLORS.hkRed,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: COLORS.bgCard,
          borderTopColor: COLORS.border,
          minHeight: 58,
          paddingTop: 5,
        },
        headerStyle: { backgroundColor: COLORS.bgSystem },
        headerShadowVisible: false,
        headerTitleStyle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700' },
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            onPress={() => changeLanguage(lang === 'en' ? 'zh-HK' : 'en')}
            style={{ paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: COLORS.hkRed, fontWeight: '700' }}>
              {lang === 'en' ? '繁中' : 'EN'}
            </Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('journey.title'),
          tabBarLabel: t('journey.title'),
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌁" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('search.title'),
          tabBarLabel: t('search.title'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌕" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: t('nearby.title'),
          tabBarLabel: t('nearby.title'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="◎" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('favorites.title'),
          tabBarLabel: t('favorites.title'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="♡" active={focused} />,
        }}
      />
    </Tabs>
  );
}
