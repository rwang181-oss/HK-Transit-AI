import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { useETAStore } from '@/src/stores/etaStore';
import { RouteCard } from '@/src/components/RouteCard';
import { COLORS } from '@/src/utils/constants';

export default function FavoritesScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const router = useRouter();
  const favoriteRoutes = useFavoriteStore((s) => s.favoriteRoutes);
  const favoriteStops = useFavoriteStore((s) => s.favoriteStops);
  const etaCache = useETAStore((s) => s.etaCache);

  // Build sectioned list data
  const sections: Array<
    | { type: 'header'; key: string; label: string; count: number }
    | { type: 'route'; key: string; data: (typeof favoriteRoutes)[number] }
    | { type: 'stop'; key: string; data: (typeof favoriteStops)[number] }
  > = [
    {
      type: 'header',
      key: 'header-routes',
      label: t('favorites.routes'),
      count: favoriteRoutes.length,
    },
    ...favoriteRoutes.map((fr) => ({
      type: 'route' as const,
      key: `route-${fr.route}-${fr.bound}-${fr.stopId}`,
      data: fr,
    })),
    {
      type: 'header',
      key: 'header-stops',
      label: t('favorites.stops'),
      count: favoriteStops.length,
    },
    ...favoriteStops.map((fs) => ({
      type: 'stop' as const,
      key: `stop-${fs.stopId}`,
      data: fs,
    })),
  ];

  if (favoriteRoutes.length === 0 && favoriteStops.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          {t('favorites.emptyRoutes')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.list}>
      {sections.map((item) => {
        if (item.type === 'header') {
          return (
            <View key={item.key} style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{item.label}</Text>
              <Text style={styles.sectionCount}>{item.count}</Text>
            </View>
          );
        }
        if (item.type === 'route') {
          const key = `${item.data.stopId}_${item.data.route}_${item.data.serviceType}`;
          return (
            <RouteCard
              key={item.key}
              favorite={item.data}
              etas={etaCache[key] || []}
              onPress={() =>
                router.push(
                  `/eta/${item.data.route}?bound=${item.data.bound}&stopId=${item.data.stopId}&serviceType=${item.data.serviceType}`
                )
              }
            />
          );
        }
        if (item.type === 'stop') {
          return (
            <Pressable
              key={item.key}
              style={styles.stopItem}
              onPress={() =>
                router.push(`/eta/1A?stopId=${item.data.stopId}&bound=O`)
              }
            >
              <Text style={styles.stopName}>
                {isEN ? item.data.name_en : item.data.name_tc}
              </Text>
            </Pressable>
          );
        }
        return null;
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgSystem,
  },
  emptyText: { fontSize: 17, color: COLORS.textSecondary },
  list: { flex: 1, backgroundColor: COLORS.bgSystem, paddingVertical: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  sectionCount: { fontSize: 16, color: COLORS.textSecondary },
  stopItem: {
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 14,
    borderRadius: 12,
  },
  stopName: { fontSize: 17, color: COLORS.textPrimary },
});
