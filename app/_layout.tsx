import '@/src/utils/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
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
