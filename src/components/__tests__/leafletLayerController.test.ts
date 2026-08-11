import { createLeafletLayerController } from '../leafletLayerController';
import type { MapPath, MapPoint } from '../transitMapInitialization';

function createLeafletFake() {
  const markerInstances: any[] = [];
  const polylineInstances: any[] = [];
  const map = {
    fitBounds: jest.fn(),
    removeLayer: jest.fn(),
  };
  const L = {
    marker: jest.fn(() => {
      const marker = {
        addTo: jest.fn(),
        bindTooltip: jest.fn(),
        setIcon: jest.fn(),
        setLatLng: jest.fn(),
        unbindTooltip: jest.fn(),
      };
      markerInstances.push(marker);
      return marker;
    }),
    polyline: jest.fn(() => {
      const polyline = {
        addTo: jest.fn(),
        setLatLngs: jest.fn(),
        setStyle: jest.fn(),
      };
      polylineInstances.push(polyline);
      return polyline;
    }),
  };
  const controller = createLeafletLayerController(map, L, {
    pointIcon: (point) => ({ kind: point.kind }),
    pathStyle: (path) => ({ color: path.color, dashed: Boolean(path.dashed) }),
  });
  return { controller, L, map, markerInstances, polylineInstances };
}

const points: MapPoint[] = [
  { id: 'me', lat: 22.3, lng: 114.2, kind: 'me', label: 'Me' },
  { id: 'target', lat: 22.31, lng: 114.21, kind: 'stop', label: 'Target' },
];
const paths: MapPath[] = [{
  id: 'route',
  points: [{ lat: 22.3, lng: 114.2 }, { lat: 22.31, lng: 114.21 }],
  color: '#C41230',
  dashed: false,
}];

describe('leafletLayerController reconciliation', () => {
  it('refits unchanged geometry after a no-fit follow phase', () => {
    const { controller, map } = createLeafletFake();

    controller.reconcile(points, paths, true);
    controller.reconcile(points, paths, false);
    controller.reconcile(points, paths, true);

    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate point ids before mutating Leaflet', () => {
    const { controller, L, map } = createLeafletFake();
    const duplicatePoints = [points[0], { ...points[1], id: points[0].id }];

    expect(() => controller.reconcile(duplicatePoints, paths, true))
      .toThrow('Duplicate MapPoint id "me"');
    expect(L.marker).not.toHaveBeenCalled();
    expect(L.polyline).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('rejects duplicate path ids before mutating Leaflet', () => {
    const { controller, L, map } = createLeafletFake();
    const duplicatePaths = [paths[0], { ...paths[0] }];

    expect(() => controller.reconcile(points, duplicatePaths, true))
      .toThrow('Duplicate MapPath id "route"');
    expect(L.marker).not.toHaveBeenCalled();
    expect(L.polyline).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('removes only keyed layers that disappear', () => {
    const { controller, map, markerInstances, polylineInstances } = createLeafletFake();
    const secondPath = { ...paths[0], id: 'context-route' };
    controller.reconcile(points, [paths[0], secondPath], false);

    controller.reconcile([points[0]], [secondPath], false);

    expect(map.removeLayer).toHaveBeenCalledTimes(2);
    expect(map.removeLayer).toHaveBeenCalledWith(markerInstances[1]);
    expect(map.removeLayer).toHaveBeenCalledWith(polylineInstances[0]);
  });

  it('updates icon, tooltip, and path style without replacing keyed layers', () => {
    const { controller, L, markerInstances, polylineInstances } = createLeafletFake();
    controller.reconcile(points, paths, false);

    controller.reconcile(
      [{ ...points[0], kind: 'start', label: 'Start' }, points[1]],
      [{ ...paths[0], color: '#007AFF', dashed: true }],
      false
    );

    expect(L.marker).toHaveBeenCalledTimes(2);
    expect(markerInstances[0].setIcon).toHaveBeenCalledWith({ kind: 'start' });
    expect(markerInstances[0].unbindTooltip).toHaveBeenCalledTimes(1);
    expect(markerInstances[0].bindTooltip).toHaveBeenLastCalledWith('Start', { direction: 'top' });
    expect(L.polyline).toHaveBeenCalledTimes(1);
    expect(polylineInstances[0].setStyle).toHaveBeenCalledWith({
      color: '#007AFF',
      dashed: true,
    });
    expect(polylineInstances[0].setLatLngs).not.toHaveBeenCalled();
  });
});
