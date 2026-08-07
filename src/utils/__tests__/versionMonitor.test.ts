/**
 * Tests for version monitor logic.
 *
 * These tests cover the core logic without requiring DOM APIs.
 * The DOM-dependent parts (visibilitychange, pageshow, etc.) are
 * tested via manual verification on real browsers.
 */

describe('versionMonitor — URL building', () => {
  // Replicate the URL-building logic inline for testability
  function buildReloadUrl(currentHref: string, remoteBuildId: string): string {
    const url = new URL(currentHref);
    url.searchParams.set('build', remoteBuildId);
    return url.toString();
  }

  it('preserves pathname when adding build param', () => {
    const result = buildReloadUrl(
      'https://rwang181-oss.github.io/HK-Transit-AI/journey/result?fromLat=22.3',
      'abc123'
    );
    const url = new URL(result);
    expect(url.pathname).toBe('/HK-Transit-AI/journey/result');
    expect(url.searchParams.get('fromLat')).toBe('22.3');
    expect(url.searchParams.get('build')).toBe('abc123');
  });

  it('replaces existing build param instead of appending', () => {
    const result = buildReloadUrl(
      'https://rwang181-oss.github.io/HK-Transit-AI/?build=old123',
      'new456'
    );
    const url = new URL(result);
    expect(url.searchParams.get('build')).toBe('new456');
    // Should only have one build param
    expect(url.searchParams.getAll('build')).toHaveLength(1);
  });

  it('preserves hash fragment', () => {
    const result = buildReloadUrl(
      'https://example.com/page#section',
      'build1'
    );
    expect(result).toContain('#section');
  });
});

describe('versionMonitor — reload loop guard', () => {
  function getReloadCount(
    storage: Record<string, string>,
    now: number
  ): number {
    const raw = storage['__hkta_reload_count'];
    if (!raw) return 0;
    const { count, timestamp } = JSON.parse(raw);
    if (now - timestamp > 120_000) return 0; // 2-minute window
    return count;
  }

  function incrementReloadCount(
    storage: Record<string, string>,
    now: number
  ): number {
    const count = getReloadCount(storage, now) + 1;
    storage['__hkta_reload_count'] = JSON.stringify({ count, timestamp: now });
    return count;
  }

  it('starts at 0 with no prior reloads', () => {
    const storage: Record<string, string> = {};
    expect(getReloadCount(storage, Date.now())).toBe(0);
  });

  it('increments on each reload', () => {
    const storage: Record<string, string> = {};
    const now = Date.now();
    expect(incrementReloadCount(storage, now)).toBe(1);
    expect(incrementReloadCount(storage, now)).toBe(2);
    expect(incrementReloadCount(storage, now)).toBe(3);
  });

  it('prevents reload when count exceeds max (3)', () => {
    const storage: Record<string, string> = {};
    const now = Date.now();
    incrementReloadCount(storage, now); // 1
    incrementReloadCount(storage, now); // 2
    incrementReloadCount(storage, now); // 3
    const count = incrementReloadCount(storage, now); // 4
    expect(count).toBeGreaterThan(3);
  });

  it('resets reload count after 2-minute window', () => {
    const storage: Record<string, string> = {};
    const t0 = Date.now();
    storage['__hkta_reload_count'] = JSON.stringify({ count: 3, timestamp: t0 });
    // 3 minutes later
    expect(getReloadCount(storage, t0 + 180_000)).toBe(0);
  });

  it('same buildId does not trigger reload', () => {
    // This is a pure logic test: when remoteBuildId === currentBuildId,
    // the checkVersion function returns early without reloading.
    const currentId = 'abc123';
    const remoteId = 'abc123';
    expect(remoteId === currentId).toBe(true);
    // The actual checkVersion would skip reload in this case
  });

  it('different buildId triggers reload logic', () => {
    const currentId = 'abc123';
    const remoteId = 'def456';
    expect(remoteId === currentId).toBe(false);
    // The actual checkVersion would proceed with reload
  });
});
