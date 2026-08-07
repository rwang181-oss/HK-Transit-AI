import '@/src/utils/i18n';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { startVersionMonitor } from '@/src/utils/versionMonitor';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    return startVersionMonitor();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="journey/result" options={{ headerShown: false }} />
        <Stack.Screen name="journey/stop-eta" options={{ headerShown: true }} />
        <Stack.Screen name="eta/[routeId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
