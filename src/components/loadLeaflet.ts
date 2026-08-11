export async function loadLeaflet(): Promise<any> {
  const module = await import('leaflet');
  return module.default || module;
}
