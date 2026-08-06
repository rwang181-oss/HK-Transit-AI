import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  sortJourneyOptions,
  useJourneyStore,
  type JourneyOption,
  type TripPoint,
} from '@/src/stores/journeyStore';
import { useWeatherStore } from '@/src/stores/weatherStore';
import { useNavigationStore } from '@/src/stores/navigationStore';
import type { JourneyMode } from '@/src/journey/model/types';
import { TransitMap } from '@/src/components/TransitMap';
import { JourneyModeChips } from '@/src/components/JourneyModeChips';
import { smartModeForWeather } from '@/src/journey/comfort/comfortEngine';
import { JourneyOptionCard } from '@/src/components/JourneyOptionCard';
import { LiveJourneyPanel } from '@/src/components/LiveJourneyPanel';
import { COLORS } from '@/src/utils/constants';

function safeDecode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function modeColor(mode: JourneyMode): string {
  switch (mode) {
    case 'fastest': return COLORS.fastest;
    case 'shade': return COLORS.shade;
    case 'rain': return COLORS.rain;
    case 'indoor': return COLORS.indoor;
    default: return COLORS.jade;
  }
}

export default function JourneyResultScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromLat: string;
    fromLng: string;
    fromName: string;
    toLat: string;
    toLng: string;
    toName: string;
  }>();
  const { status, error, loadData, getHubById } = useJourneyStore();
  const { weather, refresh: refreshWeather } = useWeatherStore();
  const startNavigation = useNavigationStore((state) => state.start);

  const fromPoint: TripPoint = useMemo(() => ({
    lat: Number(params.fromLat || 0),
    lng: Number(params.fromLng || 0),
    name: safeDecode(params.fromName),
  }), [params.fromLat, params.fromLng, params.fromName]);
  const toPoint: TripPoint = useMemo(() => ({
    lat: Number(params.toLat || 0),
    lng: Number(params.toLng || 0),
    name: safeDecode(params.toName),
  }), [params.toLat, params.toLng, params.toName]);

  const [options, setOptions] = useState<JourneyOption[]>([]);
  const [mode, setMode] = useState<JourneyMode>('recommended');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planAttempt, setPlanAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPlanning(true);
      setPlanError(null);
      await Promise.all([loadData(), refreshWeather()]);
      if (cancelled) return;
      try {
        const currentWeather = useWeatherStore.getState().weather;
        const planned = await useJourneyStore.getState().plan(fromPoint, toPoint, currentWeather);
        if (cancelled) return;
        setOptions(planned);
        const suggestedMode = smartModeForWeather(currentWeather);
        setMode(suggestedMode);
        const sorted = sortJourneyOptions(planned, suggestedMode);
        setSelectedId(sorted[0]?.id || null);
        setExpandedId(sorted[0]?.id || null);
      } catch (caught) {
        if (!cancelled) setPlanError(String(caught));
      } finally {
        if (!cancelled) setPlanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng, planAttempt]);

  const ranked = useMemo(() => sortJourneyOptions(options, mode), [options, mode]);
  const selected = ranked.find((option) => option.id === selectedId) || ranked[0] || null;

  useEffect(() => {
    if (ranked.length && !ranked.some((option) => option.id === selectedId)) {
      setSelectedId(ranked[0].id);
    }
  }, [ranked, selectedId]);

  const hubName = (hubId: string): string => {
    const hub = getHubById(hubId);
    if (!hub) return '';
    return i18n.language === 'en' ? hub.name_en : hub.name_tc || hub.name_sc || hub.name_en;
  };

  const openEta = (option: JourneyOption) => {
    if (!option.boardStopId || !option.boardRoute) return;
    const name = hubName(option.boardHub.id) || option.boardHub.name_en;
    const query = new URLSearchParams({
      provider: option.boardProvider,
      route: option.boardRoute,
      stopId: option.boardStopId,
      name,
    });
    router.push(`/journey/stop-eta?${query.toString()}` as never);
  };

  const start = async (option: JourneyOption) => {
    setSelectedId(option.id);
    await startNavigation(option, toPoint);
  };

  const mapPoints = selected
    ? selected.geometry.map((point) => ({
        lat: point.lat,
        lng: point.lng,
        label: point.label,
        kind: point.kind === 'walk' ? 'stop' as const : point.kind,
      }))
    : [
        { ...fromPoint, kind: 'start' as const },
        { ...toPoint, kind: 'end' as const },
      ];

  const center = selected
    ? selected.geometry[Math.floor(selected.geometry.length / 2)] || fromPoint
    : { lat: (fromPoint.lat + toPoint.lat) / 2, lng: (fromPoint.lng + toPoint.lng) / 2 };

  const weatherSummary = [
    weather.temperatureC == null ? null : `${Math.round(weather.temperatureC)}°C`,
    weather.uvIndex == null ? null : `UV ${weather.uvIndex}`,
    t(`weather.rain.${weather.rainIntensity}`),
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerEyebrow}>{t('journey.routeOptions')}</Text>
          <Text style={styles.routeSummary} numberOfLines={1}>
            {fromPoint.name} → {toPoint.name}
          </Text>
        </View>
        <View style={styles.weatherBadge}>
          <Text style={styles.weatherBadgeText}>{weatherSummary}</Text>
        </View>
      </View>

      {planning || status === 'loading' ? (
        <View style={styles.center}>
          <View style={styles.loadingOrb}>
            <ActivityIndicator size="large" color={COLORS.hkRed} />
          </View>
          <Text style={styles.loadingTitle}>{t('journey.loading')}</Text>
          <Text style={styles.loadingSubtitle}>{t('journey.loadingSubtitle')}</Text>
        </View>
      ) : error || planError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t('journey.dataError')}</Text>
          <Text style={styles.errorDetail}>{planError || error}</Text>
          <Pressable style={styles.retryButton} onPress={() => setPlanAttempt((value) => value + 1)}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.mapWrap}>
            <TransitMap
              center={center}
              points={mapPoints}
              paths={selected ? [{ id: selected.id, points: selected.geometry, color: modeColor(mode), dashed: true }] : []}
              height={285}
            />
            <View style={styles.mapNotice}>
              <Text style={styles.mapNoticeText}>{t('journey.approximateGeometry')}</Text>
            </View>
          </View>

          <LiveJourneyPanel />

          <JourneyModeChips value={mode} onChange={setMode} weather={weather} />

          <View style={styles.countRow}>
            <Text style={styles.countTitle}>{t('journey.optionsFound', { count: ranked.length })}</Text>
            <Text style={styles.countMeta}>{t('journey.sortedBy', { mode: t(`journey.modes.${mode}`) })}</Text>
          </View>

          {ranked.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>⌁</Text>
              <Text style={styles.emptyTitle}>{t('journey.noResult')}</Text>
              <Text style={styles.emptyText}>{t('journey.noResultHelp')}</Text>
            </View>
          ) : (
            ranked.map((option, index) => (
              <JourneyOptionCard
                key={option.id}
                option={option}
                rank={index}
                mode={mode}
                selected={selected?.id === option.id}
                expanded={expandedId === option.id}
                hubName={hubName}
                onSelect={() => setSelectedId(option.id)}
                onToggle={() => setExpandedId(expandedId === option.id ? null : option.id)}
                onStart={() => start(option)}
                onOpenEta={() => openEta(option)}
              />
            ))
          )}

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerTitle}>{t('journey.estimateTitle')}</Text>
            <Text style={styles.disclaimerText}>{t('journey.estimateDisclosure')}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  header: { minHeight: 70, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.bgSystem },
  backButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 31, marginTop: -3 },
  headerTextBlock: { flex: 1 },
  headerEyebrow: { color: COLORS.hkRed, fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  routeSummary: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 3 },
  weatherBadge: { maxWidth: '36%', borderRadius: 12, backgroundColor: COLORS.bgCard, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border },
  weatherBadgeText: { color: COLORS.textSecondary, fontSize: 9, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingOrb: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A43', shadowOpacity: 0.08, shadowRadius: 20 },
  loadingTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700', marginTop: 20 },
  loadingSubtitle: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7, maxWidth: 360 },
  errorTitle: { color: COLORS.hkRed, fontSize: 18, fontWeight: '700' },
  errorDetail: { color: COLORS.textSecondary, fontSize: 11, marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 18, borderRadius: 13, backgroundColor: COLORS.hkRed, paddingHorizontal: 20, paddingVertical: 11 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingBottom: 34 },
  mapWrap: { margin: 16, position: 'relative' },
  mapNotice: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(16,42,67,0.88)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  mapNoticeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '600' },
  countRow: { paddingHorizontal: 18, marginTop: 17, marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  countTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  countMeta: { color: COLORS.textTertiary, fontSize: 10, textAlign: 'right' },
  emptyCard: { marginHorizontal: 16, borderRadius: 22, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', padding: 30 },
  emptyIcon: { fontSize: 28, color: COLORS.textTertiary },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 10 },
  emptyText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  disclaimer: { marginHorizontal: 18, marginTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  disclaimerTitle: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  disclaimerText: { color: COLORS.textTertiary, fontSize: 10, lineHeight: 16, marginTop: 5 },
});
