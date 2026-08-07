import { useEffect, useRef } from 'react';
import { Platform, View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { useTranslation } from 'react-i18next';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  kind?: 'start' | 'end' | 'stop' | 'me';
}

export interface MapPath {
  id: string;
  points: Array<{ lat: number; lng: number }>;
  color?: string;
  dashed?: boolean;
}

interface TransitMapProps {
  center: { lat: number; lng: number };
  points: MapPoint[];
  paths?: MapPath[];
  height?: number;
  onPickPoint?: (point: { lat: number; lng: number }) => void;
}

function pointColor(kind: MapPoint['kind']): string {
  switch (kind) {
    case 'start': return '#17A673';
    case 'end': return '#C41230';
    case 'me': return '#007AFF';
    default: return '#FF9500';
  }
}

export function TransitMap({
  center,
  points,
  paths = [],
  height = 240,
  onPickPoint,
}: TransitMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const pickHandlerRef = useRef(onPickPoint);
  pickHandlerRef.current = onPickPoint;

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
      map = L.map(containerRef.current as any, {
        center: [center.lat, center.lng],
        zoom: 15,
        attributionControl: true,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap, © CARTO',
      }).addTo(map);
      map.on('click', (event: any) => {
        pickHandlerRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
      mapRef.current = map;
      renderLayers(map, L, points, paths);
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      disposed = true;
      mapRef.current = null;
      leafletRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    renderLayers(map, L, points, paths);
  }, [points, paths]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.panTo([center.lat, center.lng], { animate: true, duration: 0.25 });
  }, [center.lat, center.lng]);

  function renderLayers(map: any, L: any, mapPoints: MapPoint[], mapPaths: MapPath[]) {
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
        opacity: 0.82,
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
      const marker = L.marker([point.lat, point.lng], { icon });
      if (point.label) marker.bindTooltip(point.label, { direction: 'top' });
      marker.addTo(layer);
      bounds.push([point.lat, point.lng]);
    }

    layer.addTo(map);
    layerRef.current = layer;
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  }

  if (Platform.OS !== 'web') {
    const destination = points.find((point) => point.kind === 'end') || points[points.length - 1];
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

  return <View ref={containerRef} style={[styles.map, { height }]} />;
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E9EDF2',
  },
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
