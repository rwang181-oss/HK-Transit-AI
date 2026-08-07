import type { ProviderId, TransitProvider } from './types';
import { kmbProvider } from './kmb';

export * from './types';

const providerPromises = new Map<ProviderId, Promise<TransitProvider>>();

export function getProvider(providerId: ProviderId): Promise<TransitProvider> {
  const cached = providerPromises.get(providerId);
  if (cached) return cached;

  const pending: Promise<TransitProvider> = (() => {
    switch (providerId) {
      case 'KMB':
        return Promise.resolve(kmbProvider);
      case 'CTB':
        return import('./ctb').then((module) => module.ctbProvider);
      case 'GMB':
        return import('./gmb').then((module) => module.gmbProvider);
      case 'MTR':
        return import('./mtr').then((module) => module.mtrProvider);
    }
  })();
  providerPromises.set(providerId, pending);
  return pending;
}

export async function getStaticProviders(): Promise<TransitProvider[]> {
  return Promise.all([
    getProvider('CTB'),
    getProvider('GMB'),
    getProvider('MTR'),
  ]);
}
