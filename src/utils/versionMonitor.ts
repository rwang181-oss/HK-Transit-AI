export interface VersionMetadata {
  buildId: string;
  commitSha?: string;
  builtAt?: string;
}

export interface ReloadGuard {
  targetBuildId: string;
  reloadedAt: number;
}

export interface VersionMonitorOptions {
  currentBuildId?: string;
  basePath?: string;
  intervalMs?: number;
  reloadGuardMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  navigate?: (url: string) => void;
  reload?: () => void;
}

const RELOAD_GUARD_KEY = 'hk-transit-version-reload';
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_RELOAD_GUARD_MS = 5 * 60_000;

function validBuildId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseVersionPayload(value: unknown): VersionMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (!validBuildId(payload.buildId)) return null;
  return {
    buildId: payload.buildId.trim(),
    ...(typeof payload.commitSha === 'string' ? { commitSha: payload.commitSha } : {}),
    ...(typeof payload.builtAt === 'string' ? { builtAt: payload.builtAt } : {}),
  };
}

export function shouldReloadVersion(
  currentBuildId: string,
  remoteBuildId: string,
  guard: ReloadGuard | null,
  nowMs: number,
  reloadGuardMs = DEFAULT_RELOAD_GUARD_MS
): boolean {
  if (!validBuildId(currentBuildId) || !validBuildId(remoteBuildId)) return false;
  if (currentBuildId.trim() === remoteBuildId.trim()) return false;
  if (
    guard?.targetBuildId === remoteBuildId.trim() &&
    Number.isFinite(guard.reloadedAt) &&
    nowMs - guard.reloadedAt < reloadGuardMs
  ) {
    return false;
  }
  return true;
}

export function buildVersionReloadUrl(currentHref: string, remoteBuildId: string): string {
  const url = new URL(currentHref);
  url.searchParams.set('build', remoteBuildId.trim());
  return url.toString();
}

function readCurrentBuildId(): string {
  if (typeof document === 'undefined') return '';
  return document
    .querySelector<HTMLMetaElement>('meta[name="hk-transit-build"]')
    ?.content?.trim() || '';
}

function readGuard(): ReloadGuard | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ReloadGuard;
    if (!validBuildId(value?.targetBuildId) || !Number.isFinite(value?.reloadedAt)) return null;
    return value;
  } catch {
    return null;
  }
}

function writeGuard(guard: ReloadGuard): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(guard));
  } catch {
    // Private browsing or storage restrictions must not break the app.
  }
}

function belongsToProject(value: string | undefined): boolean {
  return Boolean(value && /hk-transit|HK-Transit-AI/i.test(value));
}

async function clearOwnedWebCaches(): Promise<void> {
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(belongsToProject).map((key) => caches.delete(key)));
    } catch {
      // Cache cleanup is best-effort.
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
            return belongsToProject(registration.scope) || belongsToProject(scriptUrl);
          })
          .map((registration) => registration.unregister())
      );
    } catch {
      // Service worker cleanup is best-effort.
    }
  }
}

export function startVersionMonitor(options: VersionMonitorOptions = {}): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const currentBuildId = options.currentBuildId || readCurrentBuildId();
  if (!validBuildId(currentBuildId)) return () => undefined;

  const basePath = (options.basePath || '/HK-Transit-AI').replace(/\/$/, '');
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const reloadGuardMs = options.reloadGuardMs ?? DEFAULT_RELOAD_GUARD_MS;
  const fetchImpl = options.fetchImpl || window.fetch.bind(window);
  const now = options.now || Date.now;
  const navigate = options.navigate || ((url: string) => window.location.assign(url));
  let stopped = false;
  let checking = false;

  const check = async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      const response = await fetchImpl(`${basePath}/version.json?t=${now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const remote = parseVersionPayload(await response.json());
      if (!remote) return;
      const nowMs = now();
      if (!shouldReloadVersion(currentBuildId, remote.buildId, readGuard(), nowMs, reloadGuardMs)) {
        return;
      }

      writeGuard({ targetBuildId: remote.buildId, reloadedAt: nowMs });
      await clearOwnedWebCaches();
      if (stopped) return;

      if (options.reload) {
        options.reload();
      } else {
        navigate(buildVersionReloadUrl(window.location.href, remote.buildId));
      }
    } catch {
      // Network failures never interrupt the current page.
    } finally {
      checking = false;
    }
  };

  const checkWhenVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void check();
  };
  const checkOnPageShow = () => void check();
  const checkOnFocus = () => void check();
  const checkOnOnline = () => void check();

  void check();
  const interval = window.setInterval(() => void check(), intervalMs);
  document.addEventListener('visibilitychange', checkWhenVisible);
  window.addEventListener('pageshow', checkOnPageShow);
  window.addEventListener('focus', checkOnFocus);
  window.addEventListener('online', checkOnOnline);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', checkWhenVisible);
    window.removeEventListener('pageshow', checkOnPageShow);
    window.removeEventListener('focus', checkOnFocus);
    window.removeEventListener('online', checkOnOnline);
  };
}
