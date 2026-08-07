/**
 * Full-screen map picker for selecting journey start / end points.
 *
 * Design:
 *   - Full-screen Leaflet map (lazy-loaded)
 *   - Fixed crosshair at the center of the viewport
 *   - User drags the map to position the crosshair over the desired location
 *   - Reverse-geocode only fires on moveend (not during drag)
 *   - "Use this location" button confirms selection
 *   - "Back to my location" button re-centers on GPS position
 *   - Returns to journey page with the selected point filled in
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { COLORS } from '@/src/utils/constants';

// Lightweight reverse-geocode cache (same Nominatim style as geocode.ts)
const geoCache = new Map<string, string>();

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = geoCache.get(key);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': 'zh-HK,en',
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) return '';
    const data = await response.json();
    const name = data?.display_name || data?.name || '';
    // Truncate long display names
    const short = name.split(',').slice(0, 3).join(',').trim();
    geoCache.set(key, short);
    return short;
  } catch {
    return '';
  }
}

export default function MapPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    target: string;
    fromLat: string;
    fromLng: string;
    toLat: string;
    toLng: string;
    myLat: string;
    myLng: string;
  }>();

  const target = params.target || 'to';
  const { position } = useLocationStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const crosshairCenter = useRef<{ lat: number; lng: number }>({
    lat: Number(params.myLat) || Number(params.toLat) || 22.3027,
    lng: Number(params.myLng) || Number(params.toLng) || 114.1772,
  });

  const [address, setAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Update address on moveend (debounced via moveend event itself)
  const updateAddress = useCallback(async (lat: number, lng: number) => {
    setGeocoding(true);
    const name = await reverseGeocode(lat, lng);
    setAddress(name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setGeocoding(false);
  }, []);

  // Initialize Leaflet map once
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let disposed = false;
    let map: any;

    (async () => {
      const module = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (disposed || !containerRef.current) return;
      const L = module.default || module;
      leafletRef.current = L;

      const center = crosshairCenter.current;
      map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 17,
        attributionControl: false,
        zoomControl: false,
      });

      // CARTO Voyager tiles — cleaner visual style than default OSM
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap, © CARTO',
      }).addTo(map);

      // Only update crosshair center on moveend (not during drag)
      map.on('moveend', () => {
        const c = map.getCenter();
        crosshairCenter.current = { lat: c.lat, lng: c.lng };
        updateAddress(c.lat, c.lng);
      });

      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    })();

    return () => {
      disposed = true;
      mapRef.current = null;
      leafletRef.current = null;
      map?.remove();
    };
  }, []);

  const goToMyLocation = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const loc = position || {
      lat: Number(params.myLat) || 22.3027,
      lng: Number(params.myLng) || 114.1772,
    };
    map.setView([loc.lat, loc.lng], 17, { animate: true, duration: 0.3 });
  }, [position, params.myLat, params.myLng]);

  const confirmAndReturn = useCallback(() => {
    const { lat, lng } = crosshairCenter.current;
    const name = address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    // Store the picked point so the journey page can consume it
    const { useJourneyStore } = require('@/src/stores/journeyStore');
    useJourneyStore.getState().setPendingMapPick({
      lat,
      lng,
      name,
      target: target as 'from' | 'to',
    });
    router.back();
  }, [address, target, router]);

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.nativeFallback}>
          <Text style={styles.nativeTitle}>{t('journey.mapPicker')}</Text>
          <Text style={styles.nativeText}>{t('journey.nativeMapBody')}</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const headerLabel =
    target === 'from' ? t('journey.mapPickerSelectFrom') : t('journey.mapPickerSelectTo');

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* Map fills entire screen */}
        <div ref={containerRef as any} style={{ flex: 1, width: '100%', position: 'relative' }}>
          {/* Crosshair - fixed center of viewport */}
          {mapReady && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid #C41230',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(196,18,48,0.12)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 2,
                  height: 38,
                  backgroundColor: '#C41230',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 38,
                  height: 2,
                  backgroundColor: '#C41230',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
          )}
        </div>

        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>{headerLabel}</Text>
          <Pressable style={styles.myLocButton} onPress={goToMyLocation}>
            <Text style={styles.myLocIcon}>◎</Text>
          </Pressable>
        </View>

        {/* Bottom bar — address + confirm */}
        <View style={styles.bottomBar}>
          <View style={styles.addressRow}>
            {geocoding ? (
              <ActivityIndicator size="small" color={COLORS.hkRed} />
            ) : (
              <Text style={styles.addressText} numberOfLines={2}>
                {address || `${crosshairCenter.current.lat.toFixed(5)}, ${crosshairCenter.current.lng.toFixed(5)}`}
              </Text>
            )}
          </View>
          <Pressable style={styles.confirmButton} onPress={confirmAndReturn}>
            <Text style={styles.confirmText}>{t('journey.mapPickerUseLocation')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 31, marginTop: -3 },
  topBarTitle: { flex: 1, color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  myLocButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocIcon: { color: COLORS.jade, fontSize: 18, fontWeight: '700' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 34,
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 10,
    gap: 10,
  },
  addressRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  addressText: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  confirmButton: {
    minHeight: 50,
    backgroundColor: COLORS.hkRed,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  nativeFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  nativeTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  nativeText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' },
  backBtn: {
    marginTop: 8,
    backgroundColor: COLORS.hkRed,
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  backBtnText: { color: '#FFFFFF', fontWeight: '700' },
});
