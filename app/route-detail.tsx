import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getProvider } from '@/src/journey/providers';
import type { ETA, ProviderId } from '@/src/journey/providers/types';
import {
  loadRouteDirection,
  loadStopEta,
  type RouteDirectionStop,
} from '@/src/journey/search/routeDetails';
import { COLORS } from '@/src/utils/constants';

const providerIds: ProviderId[] = ['KMB', 'CTB', 'GMB', 'MTR'];

function isProviderId(value: string | undefined): value is ProviderId {
  return Boolean(value && providerIds.includes(value as ProviderId));
}

function describeEta(eta: ETA): string {
  const minutes = Math.round((new Date(eta.eta).getTime() - Date.now()) / 60_000);
  return minutes <= 0 ? '0' : String(minutes);
}

export default function RouteDetailScreen() {
  const { t, i18n } = useTranslation();
  const { provider: providerParam, route, bound: boundParam } = useLocalSearchParams<{
    provider?: string;
    route?: string;
    bound?: string;
  }>();
  const provider = Array.isArray(providerParam) ? undefined : providerParam;
  const routeCode = Array.isArray(route) ? '' : route || '';
  const bound = boundParam === 'I' ? 'I' : boundParam === 'O' ? 'O' : undefined;
  const isEN = i18n.language === 'en';
  const [stops, setStops] = useState<RouteDirectionStop[]>([]);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [etas, setEtas] = useState<Record<string, ETA[]>>({});
  const [etaErrors, setEtaErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isProviderId(provider) || !routeCode || !bound) {
      setLoading(false);
      setLoadError(true);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(false);
    void getProvider(provider)
      .then((transitProvider) => loadRouteDirection(transitProvider, routeCode, bound))
      .then((rows) => {
        if (active) setStops(rows);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [provider, routeCode, bound]);

  const toggleStop = async (stopId: string) => {
    if (expandedStopId === stopId) {
      setExpandedStopId(null);
      return;
    }
    setExpandedStopId(stopId);
    if (!isProviderId(provider) || !routeCode || etas[stopId]) return;

    try {
      const transitProvider = await getProvider(provider);
      const rows = await loadStopEta(transitProvider, stopId, routeCode);
      setEtas((current) => ({ ...current, [stopId]: rows }));
    } catch {
      setEtaErrors((current) => ({ ...current, [stopId]: true }));
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: routeCode || t('search.title') }} />
      {loading ? (
        <View style={styles.center}><Text style={styles.message}>{t('home.loading')}</Text></View>
      ) : loadError ? (
        <View style={styles.center}><Text style={styles.message}>{t('search.providerUnavailable')}</Text></View>
      ) : (
        <ScrollView style={styles.list}>
          {stops.map(({ link, stop }) => {
            const expanded = expandedStopId === stop.stopId;
            const stopEtas = etas[stop.stopId];
            const stopName = isEN ? stop.name_en : stop.name_tc;
            return (
              <Pressable key={`${link.stopId}-${link.seq}`} style={styles.stopRow} onPress={() => void toggleStop(stop.stopId)}>
                <View style={styles.stopHeader}>
                  <Text style={styles.sequence}>{link.seq}</Text>
                  <Text style={styles.stopName}>{stopName || stop.stopId}</Text>
                </View>
                {expanded && (
                  <View style={styles.etaPanel}>
                    {etaErrors[stop.stopId] ? (
                      <Text style={styles.etaError}>{t('eta.loadError')}</Text>
                    ) : !stopEtas ? (
                      <Text style={styles.etaText}>{t('home.loading')}</Text>
                    ) : stopEtas.length === 0 ? (
                      <Text style={styles.etaText}>{t('eta.unavailable')}</Text>
                    ) : (
                      stopEtas.map((eta, index) => (
                        <Text key={`${eta.eta}-${index}`} style={styles.etaText}>
                          {t('eta.nextBus')}: {describeEta(eta)} {t('eta.min')}
                        </Text>
                      ))
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { color: COLORS.textSecondary, fontSize: 16, textAlign: 'center' },
  list: { flex: 1, paddingVertical: 8 },
  stopRow: { backgroundColor: COLORS.bgCard, marginHorizontal: 16, marginVertical: 3, borderRadius: 12, padding: 14 },
  stopHeader: { flexDirection: 'row', alignItems: 'center' },
  sequence: { color: COLORS.hkRed, fontSize: 16, fontWeight: '700', width: 30 },
  stopName: { color: COLORS.textPrimary, flex: 1, fontSize: 16 },
  etaPanel: { marginLeft: 30, marginTop: 10 },
  etaText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 2 },
  etaError: { color: COLORS.hkRed, fontSize: 14 },
});
