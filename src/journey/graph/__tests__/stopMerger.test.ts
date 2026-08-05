import { mergeStops, normalizeName } from '../stopMerger';
import type { Stop } from '@/src/journey/providers/types';

function makeStop(
  provider: Stop['provider'],
  stopId: string,
  name_en: string,
  name_tc: string
): Stop {
  return { stopId, name_en, name_tc, lat: 0, lng: 0, provider };
}

describe('normalizeName', () => {
  it('strips parentheses and common suffixes', () => {
    expect(normalizeName('紅磡站 (East Exit)')).toBe('紅磡');
    expect(normalizeName('Hung Hom Station')).toBe('hung hom');
  });

  it('lowercases and collapses whitespace', () => {
    expect(normalizeName('  Central   Station  ')).toBe('central');
  });
});

describe('mergeStops', () => {
  it('merges same-name stops across providers', () => {
    const stops: Stop[] = [
      makeStop('KMB', 'A1', 'Hung Hom Station', '紅磡站'),
      makeStop('MTR', 'HUH', 'Hung Hom Station', '紅磡站'),
      makeStop('GMB', '2001', 'Hung Hom Station', '紅磡站'),
    ];
    const hubs = mergeStops(stops);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].members).toHaveLength(3);
  });

  it('keeps different-name stops separate', () => {
    const stops: Stop[] = [
      makeStop('KMB', 'A1', 'Star Ferry', '尖沙咀碼頭'),
      makeStop('KMB', 'A2', 'Hung Hom Station', '紅磡站'),
    ];
    const hubs = mergeStops(stops);
    expect(hubs).toHaveLength(2);
  });

  it('deduplicates identical members within a hub', () => {
    const stops: Stop[] = [
      makeStop('KMB', 'A1', 'PolyU', '香港理工大學'),
      makeStop('KMB', 'A1', 'PolyU', '香港理工大學'),
    ];
    const hubs = mergeStops(stops);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].members).toHaveLength(1);
  });

  it('merges parenthetical variants', () => {
    const stops: Stop[] = [
      makeStop('KMB', 'A1', 'Central (Macao Ferry)', '中環 (港澳碼頭)'),
      makeStop('CTB', '001027', 'Central (Macao Ferry)', '中環 (港澳碼頭)'),
    ];
    const hubs = mergeStops(stops);
    expect(hubs).toHaveLength(1);
  });
});
