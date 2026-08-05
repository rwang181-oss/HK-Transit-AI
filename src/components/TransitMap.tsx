import { useEffect, useRef } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  kind?: 'start' | 'end' | 'stop' | 'me';
}

interface TransitMapProps {
  center: { lat: number; lng: number };
  points: MapPoint[];
  height?: number;
  onPickPoint?: (p: { lat: number; lng: number }) => void;
}

function pointColor(kind: MapPoint['kind']): string {
  switch (kind) {
    case 'start':
      return '#34C759';
    case 'end':
      return '#FF3B30';
    case 'me':
      return '#007AFF';
    default:
      return COLORS.hkRed;
  }
}

/**
 * Leaflet map for Web. Native platforms render a placeholder.
 */
export function TransitMap({
  center,
  points,
  height = 240,
  onPickPoint,
}: TransitMapProps) {
  const containerRef = useRef<View>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let map: any = null;
    let disposed = false;

    (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current as any, {
        center: [center.lat, center.lng],
        zoom: 15,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);
      if (onPickPoint) {
        map.on('click', (e: any) => {
          onPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
        });
      }
      mapRef.current = map;
      renderPoints(map, points);
    })();

    return () => {
      disposed = true;
      map?.remove();
    };
  }, []);

  // Re-render markers when points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    renderPoints(map, points);
  }, [points, points.length]);

  function renderPoints(map: any, pts: MapPoint[]) {
    if (!map || !pts) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    const L = (window as any).L;
    if (!L) return;
    const layer = L.layerGroup();
    pts.forEach((p) => {
      const icon = L.divIcon({
        className: 'hk-transit-marker',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${pointColor(p.kind)};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([p.lat, p.lng], { icon });
      if (p.label) marker.bindTooltip(p.label, { direction: 'top' });
      layer.addLayer(marker);
    });
    layer.addTo(map);
    layerRef.current = layer;
  }

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Map (Web only)</Text>
      </View>
    );
  }

  return <View ref={containerRef} style={[styles.map, { height }]} />;
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  placeholder: {
    width: '100%',
    backgroundColor: COLORS.bgSystem,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: COLORS.textSecondary, fontSize: 14 },
});
