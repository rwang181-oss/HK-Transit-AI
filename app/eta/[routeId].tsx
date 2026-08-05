import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteStore } from '@/src/stores/routeStore';
import { useETAStore } from '@/src/stores/etaStore';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { StopItem } from '@/src/components/StopItem';
import { COLORS } from '@/src/utils/constants';
import type { RouteStop } from '@/src/services/kmbAPI';

export default function ETAScreen() {
  const {
    routeId,
    bound: initialBound,
    stopId: initialStopId,
    serviceType: initialST,
  } = useLocalSearchParams<{
    routeId: string;
    bound?: string;
    stopId?: string;
    serviceType?: string;
  }>();

  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const { getStopsForRoute, getStopById, routes } = useRouteStore();
  const { etaCache, fetchETAForStop, startAutoRefresh, stopAutoRefresh, loading } = useETAStore();
  const {
    addRoute, removeRoute, addStop, removeStop,
    isRouteFavorited, isStopFavorited,
  } = useFavoriteStore();

  const [bound, setBound] = useState<'O' | 'I'>(
    initialBound === 'I' ? 'I' : 'O'
  );
  const serviceType = parseInt(initialST || '1', 10);
  const [stopList, setStopList] = useState<RouteStop[]>([]);

  const route = routes.find((r) => r.route === routeId);
  const destName = isEN ? route?.dest_en : route?.dest_tc;

  useEffect(() => {
    getStopsForRoute(routeId, bound, serviceType).then(setStopList);
  }, [routeId, bound, serviceType]);

  useEffect(() => {
    if (stopList.length > 0) {
      const targetStop =
        initialStopId && stopList.find((s) => s.stop === initialStopId)
          ? initialStopId
          : stopList[0].stop;
      startAutoRefresh(targetStop, routeId, serviceType);
    }
    return () => stopAutoRefresh();
  }, [stopList.length]);

  const toggleBound = () => {
    setBound((b) => (b === 'O' ? 'I' : 'O'));
  };

  const handleToggleRouteFav = () => {
    if (!route || !stopList[0]) return;
    const stopId = initialStopId || stopList[0].stop;
    const stop = getStopById(stopId);
    if (!stop) return;
    if (isRouteFavorited(routeId, bound, stopId)) {
      removeRoute(routeId, bound, stopId);
    } else {
      addRoute({
        route: routeId,
        bound,
        stopId,
        dest_en: route.dest_en,
        dest_tc: route.dest_tc,
        stopNameEn: stop.name_en,
        stopNameTc: stop.name_tc,
        serviceType,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('eta.title', { route: routeId }),
          headerRight: () => (
            <Text
              style={styles.favButton}
              onPress={handleToggleRouteFav}
            >
              {isRouteFavorited(
                routeId,
                bound,
                initialStopId || stopList[0]?.stop || ''
              )
                ? '★'
                : '☆'}
            </Text>
          ),
        }}
      />
      <View style={styles.boundSelector}>
        <Text style={styles.boundLabel}>
          {destName || routeId}
        </Text>
        <Text style={styles.boundToggle} onPress={toggleBound}>
          {bound === 'O' ? t('search.outbound') : t('search.inbound')} ⇄
        </Text>
      </View>
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() =>
              fetchETAForStop(
                stopList[0]?.stop || '',
                routeId,
                serviceType
              )
            }
            tintColor={COLORS.hkRed}
          />
        }
      >
        {stopList.map((item) => {
          const stop = getStopById(item.stop);
          const name = isEN ? stop?.name_en : stop?.name_tc;
          const key = `${item.stop}_${routeId}_${serviceType}`;
          const etas = etaCache[key] || [];
          const favStopId = item.stop;
          return (
            <StopItem
              key={`${item.stop}_${item.seq}`}
              stopName={name || item.stop}
              seq={item.seq}
              etas={etas}
              onPress={() =>
                fetchETAForStop(item.stop, routeId, serviceType)
              }
              isFavorite={isStopFavorited(favStopId)}
              onToggleFavorite={() => {
                if (isStopFavorited(favStopId)) {
                  removeStop(favStopId);
                } else if (stop) {
                  addStop({
                    stopId: favStopId,
                    name_en: stop.name_en,
                    name_tc: stop.name_tc,
                  });
                }
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  boundSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  boundLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  boundToggle: {
    fontSize: 15,
    color: COLORS.hkRed,
    fontWeight: '600',
  },
  list: { flex: 1, paddingVertical: 8 },
  favButton: { fontSize: 22, paddingHorizontal: 8 },
});
