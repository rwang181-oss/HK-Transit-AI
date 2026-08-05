import { useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { useETAStore } from '@/src/stores/etaStore';
import { useRouteStore } from '@/src/stores/routeStore';
import { RouteCard } from '@/src/components/RouteCard';
import { COLORS } from '@/src/utils/constants';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const favoriteRoutes = useFavoriteStore((s) => s.favoriteRoutes);
  const etaCache = useETAStore((s) => s.etaCache);
  const fetchETAForStop = useETAStore((s) => s.fetchETAForStop);
  const loading = useETAStore((s) => s.loading);
  const startAutoRefresh = useETAStore((s) => s.startAutoRefresh);
  const stopAutoRefresh = useETAStore((s) => s.stopAutoRefresh);
  const loadRouteData = useRouteStore((s) => s.loadRouteData);
  const loaded = useRouteStore((s) => s.loaded);

  useEffect(() => {
    loadRouteData();
  }, []);

  const loadAllETAs = useCallback(async () => {
    for (const fav of favoriteRoutes) {
      await fetchETAForStop(fav.stopId, fav.route, fav.serviceType);
    }
  }, [favoriteRoutes, fetchETAForStop]);

  useEffect(() => {
    if (favoriteRoutes.length > 0) {
      loadAllETAs();
      const first = favoriteRoutes[0];
      startAutoRefresh(first.stopId, first.route, first.serviceType);
    }
    return () => stopAutoRefresh();
  }, [favoriteRoutes.length]);

  const handleRoutePress = (fav: (typeof favoriteRoutes)[number]) => {
    router.push(
      `/eta/${fav.route}?bound=${fav.bound}&stopId=${fav.stopId}&serviceType=${fav.serviceType}`
    );
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t('home.loading')}</Text>
      </View>
    );
  }

  if (favoriteRoutes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('home.emptySubtitle')}</Text>
        <Text
          style={styles.linkText}
          onPress={() => router.push('/search')}
        >
          {t('home.goToSearch')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favoriteRoutes}
      keyExtractor={(item) =>
        `${item.route}_${item.bound}_${item.stopId}`
      }
      renderItem={({ item }) => {
        const key = `${item.stopId}_${item.route}_${item.serviceType}`;
        const etas = etaCache[key] || [];
        return (
          <RouteCard
            favorite={item}
            etas={etas}
            onPress={() => handleRoutePress(item)}
          />
        );
      }}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={loadAllETAs}
          tintColor={COLORS.hkRed}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.bgSystem,
  },
  loadingText: { fontSize: 17, color: COLORS.textSecondary },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  linkText: { fontSize: 17, color: COLORS.hkRed, fontWeight: '600' },
  list: { backgroundColor: COLORS.bgSystem, paddingVertical: 12 },
});
