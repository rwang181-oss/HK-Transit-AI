import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createTransitMapInitialization,
  type MapPath,
  type MapPoint,
} from '@/src/components/transitMapInitialization';
import { loadLeaflet } from '@/src/components/loadLeaflet';
import { COLORS } from '@/src/utils/constants';

export type { MapPath, MapPoint } from '@/src/components/transitMapInitialization';

interface TransitMapProps {
  center: { lat: number; lng: number };
  points: MapPoint[];
  paths?: MapPath[];
  height?: number;
  onPickPoint?: (point: { lat: number; lng: number }) => void;
  followPoint?: { lat: number; lng: number } | null;
  followZoom?: number;
}

function pointColor(kind: MapPoint['kind']): string {
  switch (kind) {
    case 'start': return '#17A673';
    case 'end': return '#C41230';
    case 'me': return '#007AFF';
    default: return '#FF9500';
  }
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

export function TransitMap({
  center,
  points,
  paths = [],
  height = 240,
  onPickPoint,
  followPoint = null,
  followZoom,
}: TransitMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const pickHandlerRef = useRef(onPickPoint);
  const initializationRef = useRef<ReturnType<typeof createTransitMapInitialization> | null>(null);
  const followingRef = useRef(true);
  const [loading, setLoading] = useState(Platform.OS === 'web');
  const [mapError, setMapError] = useState(false);
  const [following, setFollowing] = useState(true);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  pickHandlerRef.current = onPickPoint;
  const initializationInput = { center, points, paths, followPoint, followZoom };
  if (initializationRef.current) initializationRef.current.update(initializationInput);
  else initializationRef.current = createTransitMapInitialization(initializationInput);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let disposed = false;
    let map: any;
    let observer: ResizeObserver | null = null;

    void (async () => {
      try {
        ensureLeafletCss();
        const L = await loadLeaflet();
        if (disposed || !containerRef.current) return;
        const initial = initializationRef.current!.consume();
        leafletRef.current = L;
        map = L.map(containerRef.current as any, {
          center: [initial.mapCenter.lat, initial.mapCenter.lng],
          zoom: initial.mapZoom,
          attributionControl: true,
          zoomControl: true,
          preferCanvas: true,
          fadeAnimation: false,
          zoomAnimation: false,
          markerZoomAnimation: false,
        });
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          {
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 10,
            detectRetina: false,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: 0,
            crossOrigin: true,
            attribution: '© OpenStreetMap contributors © CARTO',
          }
        ).addTo(map);
        map.on('click', (event: any) => {
          pickHandlerRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        });
        map.on('dragstart', () => {
          followingRef.current = false;
          setFollowing(false);
        });
        map.whenReady(() => {
          if (!disposed) setLoading(false);
        });
        mapRef.current = map;
        renderLayers(map, L, initial.points, initial.paths, initial.shouldFitBounds);
        setMapReadyVersion((version) => version + 1);
        requestAnimationFrame(() => map.invalidateSize(false));

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            requestAnimationFrame(() => map?.invalidateSize(false));
          });
          observer.observe(containerRef.current as any);
        }
      } catch {
        if (!disposed) {
          setLoading(false);
          setMapError(true);
        }
      }
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      mapRef.current = null;
      leafletRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    renderLayers(map, L, points, paths, !followPoint);
    if (followingRef.current && followPoint) {
      map.setView(
        [followPoint.lat, followPoint.lng],
        followZoom ?? Math.max(map.getZoom(), 16),
        { animate: false }
      );
    }
  }, [points, paths, followPoint?.lat, followPoint?.lng, followZoom, mapReadyVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || followPoint) return;
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
  }, [center.lat, center.lng, followPoint, mapReadyVersion]);

  const recenter = () => {
    followingRef.current = true;
    setFollowing(true);
    const map = mapRef.current;
    if (!map || !followPoint) return;
    map.setView(
      [followPoint.lat, followPoint.lng],
      followZoom ?? Math.max(map.getZoom(), 16),
      { animate: false }
    );
  };

  function renderLayers(
    map: any,
    L: any,
    mapPoints: MapPoint[],
    mapPaths: MapPath[],
    shouldFitBounds: boolean
  ) {
    if (layerRef.current) map.removeLayer(layerRef.current);
    const layer = L.layerGroup();
    const bounds: Array<[number, number]> = [];

    for (const path of mapPaths) {
      const latLngs = path.points
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
        .map((point) => [point.lat, point.lng] as [number, number]);
      if (latLngs.length < 2) continue;
      L.polyline(latLngs, {
        color: path.color || COLORS.hkRed,
        weight: 5,
        opacity: 0.86,
        dashArray: path.dashed ? '8 8' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layer);
      bounds.push(...latLngs);
    }

    for (const point of mapPoints) {
      const icon = L.divIcon({
        className: 'hk-transit-marker',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${pointColor(point.kind)};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([point.lat, point.lng], { icon, keyboard: false });
      if (point.label) marker.bindTooltip(point.label, { direction: 'top' });
      marker.addTo(layer);
      bounds.push([point.lat, point.lng]);
    }

    layer.addTo(map);
    layerRef.current = layer;
    if (shouldFitBounds && bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
    }
  }

  if (Platform.OS !== 'web') {
    const destination = points.find((point) => point.kind === 'end')
      ?? [...points].reverse().find((point) => point.kind === 'stop');
    return (
      <View style={[styles.nativeCard, { height }]}>
        <Text style={styles.nativeTitle}>{t('journey.nativeMapTitle')}</Text>
        <Text style={styles.nativeText}>{t('journey.nativeMapBody')}</Text>
        {destination ? (
          <Pressable
            style={styles.nativeButton}
            onPress={() =>
              Linking.openURL(
                `https://maps.apple.com/?daddr=${destination.lat},${destination.lng}&dirflg=w`
              ).catch(() => undefined)
            }
          >
            <Text style={styles.nativeButtonText}>{t('journey.openAppleMaps')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.map, { height }]}>
      <View ref={containerRef} style={styles.mapCanvas} />
      {loading ? (
        <View pointerEvents="none" style={styles.mapOverlay}>
          <ActivityIndicator size="small" color={COLORS.hkRed} />
          <Text style={styles.loadingText}>{t('journey.loadingMap')}</Text>
        </View>
      ) : null}
      {mapError ? (
        <View pointerEvents="none" style={styles.mapOverlay}>
          <Text style={styles.errorText}>{t('journey.mapUnavailable')}</Text>
        </View>
      ) : null}
      {!following && followPoint && !mapError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('navigation.recenter')}
          onPress={recenter}
          style={styles.recenterButton}
        >
          <Text style={styles.recenterText}>{t('navigation.recenter')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E9EDF2',
  },
  mapCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(244,246,248,0.88)',
  },
  loadingText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  errorText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  recenterButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  recenterText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  nativeCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  nativeTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  nativeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 360,
  },
  nativeButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  nativeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
