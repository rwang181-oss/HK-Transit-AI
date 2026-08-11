const SERVICE_TYPE_PREFIX = 'serviceType=';

export function createKmbServiceVariant(serviceType: number): string | undefined {
  return serviceType > 1 ? `${SERVICE_TYPE_PREFIX}${serviceType}` : undefined;
}

export function parseKmbServiceType(routeVariant?: string): number {
  if (!routeVariant?.startsWith(SERVICE_TYPE_PREFIX)) return 1;
  const value = Number(routeVariant.slice(SERVICE_TYPE_PREFIX.length));
  return Number.isInteger(value) && value > 0 ? value : 1;
}
