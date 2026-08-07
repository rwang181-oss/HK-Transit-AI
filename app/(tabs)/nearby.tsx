import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { useRouteStore } from '@/src/stores/routeStore';
import { fetchStopETA, type Stop } from '@/src/services/kmbAPI';
import {
  NearbyStopCard,
  type NearbyRouteAction,
} from '@/src/components/NearbyStopCard';
import { cleanStopName } from '@/src/journey/graph/stopMerger';
import { mapWithConcurrency } from '@/src/utils/asyncPool';
import { COLORS } from '@/src/utils/constants';

function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function NearbyScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const router = useRouter();
  const {
    position,
    permissionGranted,
    loading,
    requestPermission,
    getPosition,
  } = useLocationStore();
  const { stops, loadRouteData } = useRouteStore();
  const [routesByStop, setRoutesByStop] = useState<Record<string, NearbyRouteAction[]>>({});

  useEffect(() => {
    void loadRouteData();
  }, [loadRouteData]);

  useEffect(() => {
    if (permissionGranted) void getPosition();
  }, [permissionGranted, getPosition]);

  const nearbyStops = useMemo<Array<Stop & { distance: number }>>(() => {
    if (!position) return [];
    return stops
      .map((stop) => ({
        ...stop,
        distance: haversine(position.lat, position.lng, stop.lat, stop.long),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [stops, position]);

  const nearbyStopKey = nearbyStops.map((stop) => stop.stop).join(',');

  useEffect(() => {
    let cancelled = false;
    if (!nearbyStops.length) return undefined;

    void mapWithConcurrency(nearbyStops, 3, async (stop) => {
      const etas = await fetchStopETA(stop.stop).catch(() => []);
      const seen = new Set<string>();
      const routes: NearbyRouteAction[] = [];
      for (const eta of etas) {
        const bound = eta.dir === 'I' ? 'I' : 'O';
        const serviceType = Number(eta.service_type) || 1;
        const key = `${eta.route}:${bound}:${serviceType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        routes.push({
          route: eta.route,
          bound,
          serviceType,
          destEn: eta.dest_en || '',
          destTc: eta.dest_tc || '',
        });
      }
      if (!cancelled) {
        setRoutesByStop((current) => ({ ...current, [stop.stop]: routes }));
      }
      return routes;
    });

    return () => {
      cancelled = true;
    };
  }, [nearbyStopKey]);

  if (!permissionGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{t('nearby.permissionDenied')}</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t('nearby.grantPermission')}</Text>
        </Pressable>
      </View>
    );
  }

  if (loading || !position) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{t('nearby.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.content}>
      {nearbyStops.map((stop) => (
        <NearbyStopCard
          key={stop.stop}
          stopName={cleanStopName(isEN ? stop.name_en : stop.name_tc)}
          distance={stop.distance}
          routes={routesByStop[stop.stop] || []}
          onRoutePress={(route) => {
            router.push(
              `/eta/${route.route}?bound=${route.bound}&stopId=${stop.stop}&serviceType=${route.serviceType}`
            );
          }}
        />
      ))}
    </ScrollView>
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
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.hkRed,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  list: { flex: 1, backgroundColor: COLORS.bgSystem },
  content: { paddingVertical: 8, width: '100%', maxWidth: 680, alignSelf: 'center' },
});
