import { Tabs } from 'expo-router';
import { COLORS } from '@/src/utils/constants';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.hkRed,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { backgroundColor: COLORS.bgCard, borderTopColor: '#E5E5EA' },
        headerStyle: { backgroundColor: COLORS.bgSystem },
        headerTitleStyle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'HK Transit', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarLabel: 'Search' }} />
      <Tabs.Screen name="nearby" options={{ title: 'Nearby', tabBarLabel: 'Nearby' }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarLabel: 'Favorites' }} />
    </Tabs>
  );
}
