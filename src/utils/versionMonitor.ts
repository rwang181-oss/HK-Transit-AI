/**
 * Version monitor — detects stale deployed bundles and refreshes the page.
 *
 * Handles iPhone Safari limitations:
 *   - setInterval is throttled / paused when the tab is backgrounded
 *   - Cache-Control headers may not be honoured by the browser
 *   - location.reload() may return a cached HTML shell
 *
 * Strategy:
 *   - Check version.json on load
 *   - Check every 60s (best-effort timer)
 *   - Check immediately on visibilitychange / pageshow / focus / online
 *   - On mismatch: navigate to current URL with ?build=<newId>
 *   - Clean project-scoped Cache Storage before reload
 *   - Guard against infinite reload loops
 */

const VERSION_PATH = '/HK-Transit-AI/version.json';
const CHECK_INTERVAL_MS = 60_000;
const MAX_RELOAD_COUNT = 3;
const RELOAD_COUNT_KEY = '__hkta_reload_count';
const RELOAD_WINDOW_MS = 120_000; // 2-minute sliding window

let currentBuildId: string | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let started = false;

function getReloadCount(): number {
  try {
    const raw = sessionStorage.getItem(RELOAD_COUNT_KEY);
    if (!raw) return 0;
    const { count, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > RELOAD_WINDOW_MS) return 0;
    return count;
  } catch {
    return 0;
  }
}

function incrementReloadCount(): number {
  const count = getReloadCount() + 1;
  sessionStorage.setItem(RELOAD_COUNT_KEY, JSON.stringify({ count, timestamp: Date.now() }));
  return count;
}

/** Clean only this project's Cache Storage entries. */
async function cleanProjectCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    const ours = keys.filter((k) => k.includes('HK-Transit-AI') || k.includes('hk-transit'));
    await Promise.all(ours.map((k) => caches.delete(k)));
  } catch {
    // Non-critical
  }
}

/** Build the reload URL: preserve pathname + existing params, inject/update build param. */
function buildReloadUrl(remoteBuildId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('build', remoteBuildId);
  return url.toString();
}

async function checkVersion(): Promise<void> {
  if (!currentBuildId) return;

  try {
    const fetchUrl = `${VERSION_PATH}?t=${Date.now()}`;
    const response = await fetch(fetchUrl, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    const remoteBuildId: string = data.buildId || '';

    if (!remoteBuildId || remoteBuildId === currentBuildId) return;

    // Version mismatch — reload with new build parameter
    const count = incrementReloadCount();
    if (count > MAX_RELOAD_COUNT) {
      console.warn('[versionMonitor] reload loop detected, skipping reload');
      return;
    }

    await cleanProjectCache();

    // Small delay so any in-flight writes settle
    setTimeout(() => {
      window.location.href = buildReloadUrl(remoteBuildId);
    }, 300);
  } catch {
    // Network error — ignore, we'll retry on next trigger
  }
}

function scheduleInterval(): void {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(checkVersion, CHECK_INTERVAL_MS);
}

export function startVersionMonitor(buildId: string): void {
  if (started) return;
  started = true;
  currentBuildId = buildId;

  // Initial check
  checkVersion();

  // Periodic check (best-effort; may be throttled by Safari)
  scheduleInterval();

  // Event-based checks — fire when the tab becomes visible / focused / online
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      checkVersion();
      scheduleInterval(); // restart timer that may have been paused
    }
  };
  const onPageShow = () => checkVersion();
  const onFocus = () => checkVersion();
  const onOnline = () => checkVersion();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
}

/** Initialize from the build ID embedded in the HTML by post-build. */
export function getBuildIdFromDom(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="build-id"]');
  return meta?.getAttribute('content') || null;
}
