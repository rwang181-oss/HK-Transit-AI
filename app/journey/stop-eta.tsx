import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ALL_PROVIDERS } from '@/src/journey/providers';
import type { ETA } from '@/src/journey/providers/types';
import { COLORS, ETA_REFRESH_INTERVAL } from '@/src/utils/constants';
import { formatPublicRouteCode } from '@/src/journey/providers/routeDisplay';

function minsUntil(eta: string): number {
  if (!eta) return -1;
  return Math.round((new Date(eta).getTime() - Date.now()) / 60000);
}

export default function StopEtaScreen() {
  const { t, i18n } = useTranslation();
  const {
    provider,
    route,
    stopId,
    name,
  } = useLocalSearchParams<{
    provider: string;
    route: string;
    stopId: string;
    name: string;
  }>();

  const publicRoute = formatPublicRouteCode(provider, route);

  const [etas, setEtas] = useState<ETA[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const prov = ALL_PROVIDERS.find((p) => p.id === provider);
    if (!prov) {
      setError('Unknown provider');
      return;
    }

    const load = async () => {
      try {
        const data = await prov.fetchETA(stopId, route);
        if (!cancelled) {
          setEtas(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };

    load();
    const timer = setInterval(load, ETA_REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [provider, route, stopId]);

  const rides = (etas || []).filter((e) => e.bound === 'O' || e.bound === 'I');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: `${publicRoute} · ${provider}`, headerBackTitle: ' ' }}
      />
      <View style={styles.header}>
        <Text style={styles.stopName} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle}>
          {t('providers.' + provider)} · {publicRoute}
        </Text>
      </View>

      {!etas && !error && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.hkRed} />
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('home.error')}</Text>
        </View>
      )}

      {etas && (
        <ScrollView style={styles.list}>
          {rides.length === 0 ? (
            <Text style={styles.empty}>{t('eta.noETA')}</Text>
          ) : (
            rides.map((e, i) => {
              const m = minsUntil(e.eta);
              const urgent = m <= 5;
              const color = urgent
                ? COLORS.etaUrgent
                : m <= 10
                  ? COLORS.etaWarning
                  : COLORS.textPrimary;
              return (
                <View key={i} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.bound}>
                      {e.bound === 'O' ? '↑' : '↓'}
                    </Text>
                    <Text style={[styles.mins, { color }]}>
                      {m < 0 ? '—' : m <= 0 ? t('eta.arriving') : `${m} ${t('eta.min')}`}
                    </Text>
                  </View>
                  {e.dest_tc && (
                    <Text style={styles.dest}>
                      {i18n.language === 'en' ? e.dest_en : e.dest_tc}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: { fontSize: 15, color: COLORS.hkRed },
  header: {
    backgroundColor: COLORS.bgCard,
    padding: 16,
    margin: 16,
    borderRadius: 16,
  },
  stopName: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  list: { flex: 1 },
  card: {
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    padding: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  bound: { fontSize: 16, color: COLORS.textSecondary, marginRight: 10 },
  mins: { fontSize: 28, fontWeight: '700' },
  dest: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  empty: {
    textAlign: 'center',
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 40,
  },
});
