import '@/src/utils/i18n'; // must be first import — initializes i18next
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="eta/[routeId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
