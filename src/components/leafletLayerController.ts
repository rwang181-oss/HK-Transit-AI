import type { MapPath, MapPoint } from './transitMapInitialization';

interface MarkerEntry {
  layer: any;
  point: MapPoint;
}

interface PathEntry {
  layer: any;
  path: MapPath;
  latLngs: Array<[number, number]>;
}

interface LeafletLayerControllerOptions {
  pointIcon: (point: MapPoint) => any;
  pathStyle: (path: MapPath) => Record<string, unknown>;
}

function validCoordinate(point: { lat: number; lng: number }): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function sameLatLngs(left: Array<[number, number]>, right: Array<[number, number]>): boolean {
  return left.length === right.length
    && left.every((point, index) => point[0] === right[index][0] && point[1] === right[index][1]);
}

function sameStyle(left: MapPath, right: MapPath): boolean {
  return left.color === right.color && Boolean(left.dashed) === Boolean(right.dashed);
}

function assertUniqueIds(
  items: Array<{ id: string }>,
  type: 'MapPoint' | 'MapPath'
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate ${type} id "${item.id}"`);
    ids.add(item.id);
  }
}

export function createLeafletLayerController(
  map: any,
  L: any,
  options: LeafletLayerControllerOptions
) {
  const markers = new Map<string, MarkerEntry>();
  const paths = new Map<string, PathEntry>();
  let fittedBoundsSignature = '';

  return {
    reconcile(mapPoints: MapPoint[], mapPaths: MapPath[], shouldFitBounds: boolean): void {
      assertUniqueIds(mapPoints, 'MapPoint');
      assertUniqueIds(mapPaths, 'MapPath');
      const bounds: Array<[number, number]> = [];
      const nextPathIds = new Set<string>();

      for (const path of mapPaths) {
        const latLngs = path.points
          .filter(validCoordinate)
          .map((point) => [point.lat, point.lng] as [number, number]);
        if (latLngs.length < 2) continue;
        nextPathIds.add(path.id);
        const existing = paths.get(path.id);
        if (!existing) {
          const layer = L.polyline(latLngs, options.pathStyle(path));
          layer.addTo(map);
          paths.set(path.id, { layer, path: { ...path }, latLngs });
        } else {
          if (!sameLatLngs(existing.latLngs, latLngs)) existing.layer.setLatLngs(latLngs);
          if (!sameStyle(existing.path, path)) existing.layer.setStyle(options.pathStyle(path));
          existing.path = { ...path };
          existing.latLngs = latLngs;
        }
        bounds.push(...latLngs);
      }

      for (const [id, entry] of paths) {
        if (nextPathIds.has(id)) continue;
        map.removeLayer(entry.layer);
        paths.delete(id);
      }

      const nextPointIds = new Set<string>();
      for (const point of mapPoints) {
        if (!validCoordinate(point)) continue;
        nextPointIds.add(point.id);
        const existing = markers.get(point.id);
        if (!existing) {
          const layer = L.marker([point.lat, point.lng], {
            icon: options.pointIcon(point),
            keyboard: false,
          });
          if (point.label) layer.bindTooltip(point.label, { direction: 'top' });
          layer.addTo(map);
          markers.set(point.id, { layer, point: { ...point } });
        } else {
          if (existing.point.lat !== point.lat || existing.point.lng !== point.lng) {
            existing.layer.setLatLng([point.lat, point.lng]);
          }
          if (existing.point.kind !== point.kind) existing.layer.setIcon(options.pointIcon(point));
          if (existing.point.label !== point.label) {
            existing.layer.unbindTooltip();
            if (point.label) existing.layer.bindTooltip(point.label, { direction: 'top' });
          }
          existing.point = { ...point };
        }
        bounds.push([point.lat, point.lng]);
      }

      for (const [id, entry] of markers) {
        if (nextPointIds.has(id)) continue;
        map.removeLayer(entry.layer);
        markers.delete(id);
      }

      const boundsSignature = JSON.stringify(bounds);
      if (!shouldFitBounds) fittedBoundsSignature = '';
      if (shouldFitBounds && bounds.length > 1 && boundsSignature !== fittedBoundsSignature) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16, animate: false });
        fittedBoundsSignature = boundsSignature;
      }
    },
  };
}
