import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { useRouteStore } from '@/src/stores/routeStore';
import {
  NearbyStopCard,
  type NearbyRouteAction,
} from '@/src/components/NearbyStopCard';
import { cleanStopName } from '@/src/journey/graph/stopMerger';
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  const { stops, loadRouteData, loadAllRouteStops, getRoutesForStop } =
    useRouteStore();

  useEffect(() => {
    loadRouteData();
    loadAllRouteStops(); // heavy: full route-stop list for reverse index
  }, []);

  useEffect(() => {
    if (permissionGranted) {
      getPosition();
    }
  }, [permissionGranted]);

  const nearbyStops = useMemo(() => {
    if (!position) return [];
    return stops
      .map((stop) => ({
        ...stop,
        distance: haversine(
          position.lat,
          position.lng,
          stop.lat,
          stop.long
        ),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [stops, position]);

  if (!permissionGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          {t('nearby.permissionDenied')}
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>
            {t('nearby.grantPermission')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{t('nearby.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.list}>
      {nearbyStops.map((stop) => {
        const routes = getRoutesForStop(stop.stop);
        const actions: NearbyRouteAction[] = routes.map((r) => ({
          route: r.route,
          bound: r.bound,
          serviceType: r.serviceType,
          destEn: r.dest_en,
          destTc: r.dest_tc,
        }));

        return (
          <NearbyStopCard
            key={stop.stop}
            stopName={cleanStopName(
              isEN ? stop.name_en : stop.name_tc
            )}
            distance={stop.distance}
            routes={actions}
            onRoutePress={(r) => {
              router.push(
                `/eta/${r.route}?bound=${r.bound}&stopId=${stop.stop}&serviceType=${r.serviceType}`
              );
            }}
          />
        );
      })}
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
    fontSize: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.hkRed,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  list: { flex: 1, backgroundColor: COLORS.bgSystem, paddingVertical: 8 },
});
