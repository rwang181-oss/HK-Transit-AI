import '@/src/utils/i18n';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Initialize version monitor on web
    import('@/src/utils/versionMonitor').then(({ getBuildIdFromDom, startVersionMonitor }) => {
      const buildId = getBuildIdFromDom();
      if (buildId) startVersionMonitor(buildId);
    });
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="journey/result" options={{ headerShown: false }} />
        <Stack.Screen name="journey/stop-eta" options={{ headerShown: true }} />
        <Stack.Screen name="journey/map-picker" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="eta/[routeId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
