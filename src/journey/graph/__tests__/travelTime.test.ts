import {
  haversineMeters,
  estimateLegMinutes,
  estimateWalkMinutes,
} from '../travelTime';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters(22.3, 114.17, 22.3, 114.17)).toBe(0);
  });

  it('computes a realistic PolyU-to-TST distance (~1.5km)', () => {
    // PolyU (22.304, 114.180) → TST Ferry (22.293, 114.171)
    const d = haversineMeters(22.304, 114.18, 22.293, 114.171);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2500);
  });
});

describe('estimateLegMinutes', () => {
  it('has a minimum of 1 minute', () => {
    const m = estimateLegMinutes(
      { lat: 22.3, lng: 114.17 },
      { lat: 22.3, lng: 114.17 },
      'KMB'
    );
    expect(m).toBeGreaterThanOrEqual(1);
  });

  it('MTR is faster than bus over the same distance', () => {
    const from = { lat: 22.3, lng: 114.17 };
    const to = { lat: 22.29, lng: 114.16 };
    const bus = estimateLegMinutes(from, to, 'KMB');
    const metro = estimateLegMinutes(from, to, 'MTR');
    expect(metro).toBeLessThan(bus);
  });
});

describe('estimateWalkMinutes', () => {
  it('has a minimum of 1.5 minutes', () => {
    expect(estimateWalkMinutes(0)).toBe(1.5);
  });

  it('scales with distance', () => {
    expect(estimateWalkMinutes(160)).toBeGreaterThan(
      estimateWalkMinutes(80)
    );
  });

  it('80m ≈ 1 minute of walking', () => {
    expect(estimateWalkMinutes(80)).toBeCloseTo(1.5, 5);
  });
});
