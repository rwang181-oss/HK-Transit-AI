import { formatMinutesLeft, formatDistance, getETADisplay } from '../formatters';

describe('formatMinutesLeft', () => {
  it('returns minutes difference from now', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    // Allow ±1 minute due to test execution timing
    const minutes = formatMinutesLeft(future);
    expect(minutes).toBeGreaterThanOrEqual(4);
    expect(minutes).toBeLessThanOrEqual(5);
  });

  it('returns 0 for past timestamps', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatMinutesLeft(past)).toBe(0);
  });

  it('returns 0 for timestamps within 60 seconds', () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    expect(formatMinutesLeft(soon)).toBe(0);
  });
});

describe('formatDistance', () => {
  it('formats meters under 1000', () => {
    expect(formatDistance(120)).toBe('120 m');
  });

  it('formats kilometers with one decimal', () => {
    expect(formatDistance(1200)).toBe('1.2 km');
  });

  it('formats exactly 1000m as km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
  });

  it('handles 0 distance', () => {
    expect(formatDistance(0)).toBe('0 m');
  });
});

describe('getETADisplay', () => {
  it('returns arriving for < 1 minute', () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    const eta = {
      co: 'KMB',
      route: '1A',
      dir: 'O' as const,
      service_type: 1,
      seq: 1,
      dest_en: 'Test',
      dest_tc: '測試',
      eta: soon,
      eta_seq: 1,
      rmk_en: '',
      rmk_tc: '',
      data_timestamp: new Date().toISOString(),
    };
    const result = getETADisplay(eta);
    expect(result.minutes).toBe(0);
    expect(result.text).toBe('Arriving');
  });

  it('returns minutes for >= 1 minute', () => {
    const future = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    const eta = {
      co: 'KMB',
      route: '1A',
      dir: 'O' as const,
      service_type: 1,
      seq: 1,
      dest_en: 'Test',
      dest_tc: '測試',
      eta: future,
      eta_seq: 1,
      rmk_en: '',
      rmk_tc: '',
      data_timestamp: new Date().toISOString(),
    };
    const result = getETADisplay(eta);
    expect(result.minutes).toBeGreaterThanOrEqual(7);
    expect(result.text).toMatch(/\d+ min/);
  });
});
