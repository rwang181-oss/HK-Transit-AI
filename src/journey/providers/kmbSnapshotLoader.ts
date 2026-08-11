export async function loadKmbSnapshot(): Promise<unknown> {
  const bundledModule = await import('./kmbSnapshot');
  return bundledModule.default;
}
