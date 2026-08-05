import { useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { useRouteStore } from '@/src/stores/routeStore';
import { NearbyStopCard } from '@/src/components/NearbyStopCard';
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
  const { stops, loadRouteData } = useRouteStore();

  useEffect(() => {
    loadRouteData();
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
    <FlatList
      data={nearbyStops}
      keyExtractor={(item) => item.stop}
      renderItem={({ item }) => (
        <NearbyStopCard
          stopName={isEN ? item.name_en : item.name_tc}
          distance={item.distance}
          routes={['—']}
          onPress={() => {
            // Navigate to first route serving this stop
            const routeId = '1A'; // fallback — in production, look up route for this stop
            router.push(
              `/eta/${routeId}?stopId=${item.stop}&bound=O`
            );
          }}
        />
      )}
      contentContainerStyle={styles.list}
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
  list: { backgroundColor: COLORS.bgSystem, paddingVertical: 8 },
});
