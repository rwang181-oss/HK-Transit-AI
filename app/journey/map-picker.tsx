import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { useMapPickerStore, type MapPickTarget } from '@/src/stores/mapPickerStore';
import { COLORS } from '@/src/utils/constants';

const DEFAULT_CENTER = { lat: 22.3027, lng: 114.1772 };
const reverseCache = new Map<string, string>();

function validCoordinate(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}

function ensureLeafletCss(): void {
  if (typeof document === 'undefined') return;
  const id = 'hk-transit-leaflet-css';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': 'zh-HK,en',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return '';
    const payload = await response.json() as { display_name?: string; name?: string };
    const raw = payload.display_name || payload.name || '';
    const shortened = raw.split(',').slice(0, 3).join(',').trim();
    if (shortened) reverseCache.set(key, shortened);
    return shortened;
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export default function MapPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    target?: string;
    fromLat?: string;
    fromLng?: string;
    toLat?: string;
    toLng?: string;
    myLat?: string;
    myLng?: string;
  }>();
  const setPending = useMapPickerStore((state) => state.setPending);
  const locateOnce = useLocationStore((state) => state.locateOnce);
  const mapContainerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const centerRef = useRef(DEFAULT_CENTER);
  const requestSequence = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [address, setAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  const target: MapPickTarget = params.target === 'from' ? 'from' : 'to';

  const initialCenter = useCallback(() => {
    const targetLat = Number(target === 'from' ? params.fromLat : params.toLat);
    const targetLng = Number(target === 'from' ? params.fromLng : params.toLng);
    if (validCoordinate(targetLat) && validCoordinate(targetLng)) {
      return { lat: targetLat, lng: targetLng };
    }
    const myLat = Number(params.myLat);
    const myLng = Number(params.myLng);
    if (validCoordinate(myLat) && validCoordinate(myLng)) return { lat: myLat, lng: myLng };
    return DEFAULT_CENTER;
  }, [params.fromLat, params.fromLng, params.toLat, params.toLng, params.myLat, params.myLng, target]);

  const updateAddress = useCallback(async (lat: number, lng: number) => {
    const sequence = ++requestSequence.current;
    setGeocoding(true);
    const resolved = await reverseGeocode(lat, lng);
    if (sequence !== requestSequence.current) return;
    setAddress(resolved || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    setGeocoding(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let disposed = false;
    let map: any;

    void (async () => {
      try {
        ensureLeafletCss();
        const module = await import('leaflet');
        if (disposed || !mapContainerRef.current) return;
        const L = module.default || module;
        const center = initialCenter();
        centerRef.current = center;
        map = L.map(mapContainerRef.current as any, {
          center: [center.lat, center.lng],
          zoom: 17,
          attributionControl: false,
          zoomControl: false,
          preferCanvas: true,
          fadeAnimation: false,
          markerZoomAnimation: false,
        });
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          {
            subdomains: 'abcd',
            minZoom: 10,
            maxZoom: 20,
            detectRetina: false,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: 1,
            crossOrigin: true,
          }
        ).addTo(map);
        map.on('moveend', () => {
          const centerValue = map.getCenter();
          centerRef.current = { lat: centerValue.lat, lng: centerValue.lng };
          void updateAddress(centerValue.lat, centerValue.lng);
        });
        mapRef.current = map;
        map.whenReady(() => {
          if (disposed) return;
          setMapReady(true);
          requestAnimationFrame(() => map.invalidateSize(false));
          void updateAddress(center.lat, center.lng);
        });
      } catch {
        if (!disposed) {
          setMapError(true);
          setMapReady(false);
        }
      }
    })();

    return () => {
      disposed = true;
      requestSequence.current += 1;
      mapRef.current = null;
      map?.remove();
    };
  }, [initialCenter, updateAddress]);

  const goToMyLocation = async () => {
    const sample = await locateOnce();
    if (!sample || !mapRef.current) return;
    mapRef.current.setView(
      [sample.position.lat, sample.position.lng],
      17,
      { animate: true, duration: 0.25 }
    );
  };

  const confirm = () => {
    const { lat, lng } = centerRef.current;
    setPending({
      target,
      lat,
      lng,
      name: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    });
    router.back();
  };

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.nativeSafeArea}>
        <View style={styles.nativeCard}>
          <Text style={styles.nativeTitle}>{t('journey.mapPicker')}</Text>
          <Text style={styles.nativeText}>{t('journey.nativeMapBody')}</Text>
          <Pressable style={styles.confirmButton} onPress={() => router.back()}>
            <Text style={styles.confirmText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View ref={mapContainerRef} style={styles.mapCanvas} />

        {!mapReady && !mapError ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={COLORS.hkRed} />
            <Text style={styles.loadingText}>{t('journey.loadingMap')}</Text>
          </View>
        ) : null}

        {mapError ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>{t('journey.mapUnavailable')}</Text>
          </View>
        ) : null}

        {mapReady ? (
          <View pointerEvents="none" style={styles.crosshair}>
            <View style={styles.crosshairRing} />
            <View style={styles.crosshairVertical} />
            <View style={styles.crosshairHorizontal} />
            <View style={styles.crosshairDot} />
          </View>
        ) : null}

        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" style={styles.roundButton} onPress={() => router.back()}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {target === 'from' ? t('journey.mapPickerSelectFrom') : t('journey.mapPickerSelectTo')}
          </Text>
          <Pressable accessibilityRole="button" style={styles.roundButton} onPress={goToMyLocation}>
            <Text style={styles.locationText}>◎</Text>
          </Pressable>
        </View>

        <View style={styles.bottomSheet}>
          <Text style={styles.addressLabel}>{t('journey.mapPickerSelectedLocation')}</Text>
          <View style={styles.addressRow}>
            {geocoding ? <ActivityIndicator size="small" color={COLORS.hkRed} /> : null}
            <Text style={styles.addressText} numberOfLines={2}>
              {address || `${centerRef.current.lat.toFixed(5)}, ${centerRef.current.lng.toFixed(5)}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!mapReady || mapError}
            style={[styles.confirmButton, (!mapReady || mapError) && styles.confirmDisabled]}
            onPress={confirm}
          >
            <Text style={styles.confirmText}>{t('journey.mapPickerUseLocation')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E9EEF3' },
  container: { flex: 1, position: 'relative', overflow: 'hidden' },
  mapCanvas: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  loadingOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(244,246,248,0.9)', zIndex: 2,
  },
  loadingText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  topBar: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 5,
    minHeight: 52, paddingHorizontal: 8, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: '#102A43', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12,
  },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgRaised },
  backText: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 31, marginTop: -3 },
  locationText: { color: COLORS.jade, fontSize: 21, fontWeight: '800' },
  title: { flex: 1, textAlign: 'center', color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  crosshair: { position: 'absolute', left: '50%', top: '50%', width: 46, height: 46, marginLeft: -23, marginTop: -31, zIndex: 4, alignItems: 'center', justifyContent: 'center' },
  crosshairRing: { position: 'absolute', width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: COLORS.hkRed, backgroundColor: 'rgba(196,18,48,0.10)' },
  crosshairVertical: { position: 'absolute', width: 2, height: 42, backgroundColor: COLORS.hkRed, borderRadius: 1 },
  crosshairHorizontal: { position: 'absolute', width: 42, height: 2, backgroundColor: COLORS.hkRed, borderRadius: 1 },
  crosshairDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.hkRed },
  bottomSheet: {
    position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 5,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.97)', padding: 14,
    shadowColor: '#102A43', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.12, shadowRadius: 14,
  },
  addressLabel: { color: COLORS.textTertiary, fontSize: 10, fontWeight: '700' },
  addressRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  addressText: { flex: 1, color: COLORS.textPrimary, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  confirmButton: { minHeight: 50, borderRadius: 16, backgroundColor: COLORS.hkRed, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  nativeSafeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  nativeCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  nativeTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  nativeText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 8, marginBottom: 18 },
});
