import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { JourneyPolicy } from '@/src/journey/model/types';
import { applyJourneyPolicy } from '@/src/journey/planner/routePolicies';
import { createProgressiveJourneySession } from '@/src/journey/index/progressivePlanner';
import { hasMeaningfullyBetterResults } from '@/src/journey/index/betterResults';
import type { IndexedJourneyOption, JourneyPoint } from '@/src/journey/index/types';
import { useNavigationStore } from '@/src/stores/navigationStore';
import { TransitMap } from '@/src/components/TransitMap';
import { JourneyModeChips } from '@/src/components/JourneyModeChips';
import { JourneyOptionCard } from '@/src/components/JourneyOptionCard';
import { NavigationModal } from '@/src/components/NavigationModal';
import { COLORS } from '@/src/utils/constants';

function safeDecode(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const POLICY_HINTS: Record<JourneyPolicy, { en: string; zh: string }> = {
  recommended: {
    en: 'Fewer transfers come first; a direct route stays ahead unless it is over 15 minutes slower.',
    zh: '先比較換乘次數；直達路線除非慢超過 15 分鐘，否則優先顯示。',
  },
  direct: {
    en: 'All direct services are placed before routes requiring a transfer.',
    zh: '所有直達路線會排在需要換乘的路線之前。',
  },
  oneTransfer: {
    en: 'Routes requiring more than one transfer are hidden.',
    zh: '隱藏需要換乘兩次或以上的路線。',
  },
  fastest: {
    en: 'Sorted by the complete estimated journey time.',
    zh: '按完整預計行程時間排序。',
  },
  lessWalking: {
    en: 'Sorted by walking distance, then transfers and total time.',
    zh: '按步行距離排序，再比較換乘次數及總時間。',
  },
};

export default function JourneyResultScreen() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'zh';
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromLat: string;
    fromLng: string;
    fromName: string;
    toLat: string;
    toLng: string;
    toName: string;
  }>();
  const startNavigation = useNavigationStore((state) => state.start);
  const navigationPhase = useNavigationStore((state) => state.phase);
  const navigationError = useNavigationStore((state) => state.error);

  const fromPoint: JourneyPoint = useMemo(() => ({
    lat: Number(params.fromLat || 0),
    lng: Number(params.fromLng || 0),
    name: safeDecode(params.fromName),
  }), [params.fromLat, params.fromLng, params.fromName]);
  const toPoint: JourneyPoint = useMemo(() => ({
    lat: Number(params.toLat || 0),
    lng: Number(params.toLng || 0),
    name: safeDecode(params.toName),
  }), [params.toLat, params.toLng, params.toName]);

  const [displayedOptions, setDisplayedOptions] = useState<IndexedJourneyOption[]>([]);
  const [pendingImprovedOptions, setPendingImprovedOptions] = useState<IndexedJourneyOption[] | null>(null);
  const [policy, setPolicy] = useState<JourneyPolicy>('recommended');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refining, setRefining] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planAttempt, setPlanAttempt] = useState(0);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [navigationVisible, setNavigationVisible] = useState(false);
  const [startingNavigation, setStartingNavigation] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    setInitialLoading(true);
    setRefining(false);
    setPlanError(null);
    setDisplayedOptions([]);
    setPendingImprovedOptions(null);
    setSelectedId(null);
    setExpandedId(null);
    setShowRouteMap(false);
    setPolicy('recommended');

    const session = createProgressiveJourneySession(fromPoint, toPoint, 'recommended');
    void (async () => {
      let initial: IndexedJourneyOption[];
      try {
        initial = await session.initial;
      } catch (caught) {
        if (generation !== generationRef.current) return;
        setPlanError(String(caught));
        setInitialLoading(false);
        return;
      }

      if (generation !== generationRef.current) return;
      setDisplayedOptions(initial);
      setInitialLoading(false);
      setRefining(true);
      const firstRanked = applyJourneyPolicy([...initial], 'recommended');
      setSelectedId(firstRanked[0]?.id || null);
      setExpandedId(firstRanked[0]?.id || null);

      try {
        const refined = await session.refined;
        if (generation !== generationRef.current) return;
        if (refined.length > 0) setPendingImprovedOptions(refined);
      } catch {
        // Background refinement never removes already displayed Stage-1 routes.
      } finally {
        if (generation === generationRef.current) setRefining(false);
      }
    })();

    return () => {
      if (generation === generationRef.current) generationRef.current += 1;
    };
  }, [fromPoint.lat, fromPoint.lng, fromPoint.name, toPoint.lat, toPoint.lng, toPoint.name, planAttempt]);

  const ranked = useMemo(
    () => applyJourneyPolicy([...displayedOptions], policy),
    [displayedOptions, policy]
  );
  const selected = ranked.find((option) => option.id === selectedId) || ranked[0] || null;
  const hasDirect = displayedOptions.some((option) => option.itinerary.isDirect);
  const betterResultsAvailable = useMemo(
    () => Boolean(
      pendingImprovedOptions &&
      hasMeaningfullyBetterResults(displayedOptions, pendingImprovedOptions, policy)
    ),
    [displayedOptions, pendingImprovedOptions, policy]
  );

  const hubLabels = useMemo(() => {
    const labels = new Map<string, { en: string; zh: string }>();
    const addHub = (hub: IndexedJourneyOption['boardHub']) => {
      labels.set(hub.id, {
        en: hub.name_en || hub.name_tc || hub.id,
        zh: hub.name_tc || hub.name_sc || hub.name_en || hub.id,
      });
    };
    for (const option of [
      ...displayedOptions,
      ...(pendingImprovedOptions || []),
    ]) {
      addHub(option.boardHub);
      addHub(option.alightHub);
      for (const leg of option.itinerary.legs) {
        if (!labels.has(leg.fromHubId)) labels.set(leg.fromHubId, { en: leg.fromName, zh: leg.fromName });
        if (!labels.has(leg.toHubId)) labels.set(leg.toHubId, { en: leg.toName, zh: leg.toName });
      }
    }
    return labels;
  }, [displayedOptions, pendingImprovedOptions]);

  const hubName = (hubId: string): string => {
    const value = hubLabels.get(hubId);
    if (!value) return hubId;
    return language === 'en' ? value.en : value.zh;
  };

  useEffect(() => {
    if (ranked.length && !ranked.some((option) => option.id === selectedId)) {
      setSelectedId(ranked[0].id);
      setExpandedId(ranked[0].id);
    }
  }, [ranked, selectedId]);

  useEffect(() => {
    if (navigationVisible && !startingNavigation && navigationPhase === 'idle' && !navigationError) {
      setNavigationVisible(false);
    }
  }, [navigationVisible, startingNavigation, navigationPhase, navigationError]);

  const openEta = (option: IndexedJourneyOption) => {
    if (!option.boardStopId || !option.boardRoute) return;
    const query = new URLSearchParams({
      provider: option.boardProvider,
      route: option.boardRoute,
      stopId: option.boardStopId,
      name: hubName(option.boardHub.id) || option.boardHub.name_en,
    });
    router.push(`/journey/stop-eta?${query.toString()}` as never);
  };

  const selectOption = (option: IndexedJourneyOption) => {
    setSelectedId(option.id);
    setExpandedId(option.id);
  };

  const changePolicy = (next: JourneyPolicy) => {
    setPolicy(next);
    const nextRanked = applyJourneyPolicy([...displayedOptions], next);
    setSelectedId(nextRanked[0]?.id || null);
    setExpandedId(nextRanked[0]?.id || null);
    setShowRouteMap(false);
  };

  const applyBetterResults = () => {
    if (!pendingImprovedOptions) return;
    const nextRanked = applyJourneyPolicy([...pendingImprovedOptions], policy);
    setDisplayedOptions(pendingImprovedOptions);
    setPendingImprovedOptions(null);
    setSelectedId(nextRanked[0]?.id || null);
    setExpandedId(nextRanked[0]?.id || null);
    setShowRouteMap(false);
  };

  const start = async (option: IndexedJourneyOption) => {
    selectOption(option);
    setNavigationVisible(true);
    setStartingNavigation(true);
    try {
      await startNavigation(option, toPoint);
    } finally {
      setStartingNavigation(false);
    }
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
  const navigationActive = navigationPhase !== 'idle' || Boolean(navigationError);
  const directUnavailable = policy === 'direct' && !hasDirect;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>{t('journey.routeOptions')}</Text>
          <Text style={styles.routeSummary} numberOfLines={1}>
            {fromPoint.name} → {toPoint.name}
          </Text>
        </View>
        {navigationActive ? (
          <Pressable style={styles.liveButton} onPress={() => setNavigationVisible(true)}>
            <Text style={styles.liveButtonText}>{t('navigation.open')}</Text>
          </Pressable>
        ) : null}
      </View>

      {initialLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.hkRed} />
          <Text style={styles.loadingTitle}>{t('journey.loading')}</Text>
        </View>
      ) : planError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t('journey.dataError')}</Text>
          <Text style={styles.errorDetail}>{planError}</Text>
          <Pressable style={styles.retryButton} onPress={() => setPlanAttempt((value) => value + 1)}>
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.page}>
            <View style={styles.countRow}>
              <Text style={styles.countTitle}>{t('journey.optionsFound', { count: ranked.length })}</Text>
              <View style={styles.countMetaRow}>
                {refining ? <ActivityIndicator size="small" color={COLORS.jade} /> : null}
                <Text style={styles.countMeta}>
                  {refining ? t('journey.refiningRoutes') : t('journey.selectRouteHint')}
                </Text>
              </View>
            </View>

            {betterResultsAvailable ? (
              <Pressable style={styles.betterResults} onPress={applyBetterResults}>
                <View style={styles.betterResultsText}>
                  <Text style={styles.betterResultsTitle}>{t('journey.betterRoutesFound')}</Text>
                  <Text style={styles.betterResultsHint}>{t('journey.betterRoutesFoundHint')}</Text>
                </View>
                <Text style={styles.betterResultsArrow}>→</Text>
              </Pressable>
            ) : null}

            <JourneyModeChips value={policy} onChange={changePolicy} />
            <View style={[styles.policyNote, directUnavailable && styles.policyWarning]}>
              <Text style={[styles.policyNoteText, directUnavailable && styles.policyWarningText]}>
                {directUnavailable
                  ? language === 'en'
                    ? 'No direct route was found within the walking range. The best low-transfer alternatives are shown.'
                    : '步行範圍內找不到直達路線，現顯示換乘較少的替代方案。'
                  : POLICY_HINTS[policy][language]}
              </Text>
            </View>

            {ranked.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{t('journey.noResult')}</Text>
                <Text style={styles.emptyText}>{t('journey.noResultHelp')}</Text>
              </View>
            ) : (
              ranked.map((option, index) => (
                <JourneyOptionCard
                  key={option.id}
                  option={option}
                  rank={index}
                  policy={policy}
                  selected={selected?.id === option.id}
                  expanded={expandedId === option.id}
                  hubName={hubName}
                  onSelect={() => selectOption(option)}
                  onToggle={() => {
                    setSelectedId(option.id);
                    setExpandedId(expandedId === option.id ? null : option.id);
                  }}
                  onStart={() => void start(option)}
                  onOpenEta={() => openEta(option)}
                />
              ))
            )}

            {selected ? (
              <Pressable style={styles.mapToggle} onPress={() => setShowRouteMap((value) => !value)}>
                <Text style={styles.mapToggleText}>
                  {showRouteMap ? t('journey.hideRouteMap') : t('journey.viewRouteMap')}
                </Text>
                <Text style={styles.mapToggleArrow}>{showRouteMap ? '⌃' : '⌄'}</Text>
              </Pressable>
            ) : null}

            {showRouteMap && selected ? (
              <View style={styles.mapWrap}>
                <TransitMap
                  center={center}
                  points={mapPoints}
                  paths={[{ id: selected.id, points: selected.geometry, color: COLORS.hkRed }]}
                  height={270}
                />
                <Text style={styles.mapNote}>
                  {selected.walkingSource === 'routed'
                    ? language === 'en' ? 'Walking sections follow the pedestrian road network.' : '步行部分按行人道路網絡顯示。'
                    : t('journey.approximateGeometry')}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      )}

      <NavigationModal
        visible={navigationVisible}
        starting={startingNavigation}
        onClose={() => setNavigationVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  header: {
    minHeight: 66,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  backText: { color: COLORS.textPrimary, fontSize: 29, lineHeight: 30, marginTop: -3 },
  headerTextBlock: { flex: 1, minWidth: 0 },
  headerTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  routeSummary: { color: COLORS.textSecondary, fontSize: 11, marginTop: 3 },
  liveButton: { minHeight: 36, maxWidth: 110, borderRadius: 11, backgroundColor: COLORS.ink, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  liveButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 16 },
  errorTitle: { color: COLORS.hkRed, fontSize: 17, fontWeight: '700' },
  errorDetail: { color: COLORS.textSecondary, fontSize: 11, marginTop: 8, textAlign: 'center' },
  retryButton: { marginTop: 17, borderRadius: 12, backgroundColor: COLORS.hkRed, paddingHorizontal: 19, paddingVertical: 10 },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingBottom: 28 },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  countRow: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  countTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  countMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flex: 1 },
  countMeta: { color: COLORS.textTertiary, fontSize: 10, textAlign: 'right', flexShrink: 1 },
  betterResults: { marginHorizontal: 12, marginBottom: 9, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, backgroundColor: '#E7F6F3', borderWidth: 1, borderColor: '#B7E3DA', flexDirection: 'row', alignItems: 'center', gap: 10 },
  betterResultsText: { flex: 1 },
  betterResultsTitle: { color: COLORS.jade, fontSize: 13, fontWeight: '800' },
  betterResultsHint: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
  betterResultsArrow: { color: COLORS.jade, fontSize: 19, fontWeight: '800' },
  policyNote: { marginHorizontal: 14, marginBottom: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: '#EAF2FF' },
  policyNoteText: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 15 },
  policyWarning: { backgroundColor: '#FFF2E5' },
  policyWarningText: { color: COLORS.etaWarning },
  emptyCard: { margin: 14, padding: 20, borderRadius: 15, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  emptyText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 6 },
  mapToggle: { marginHorizontal: 12, marginTop: 2, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapToggleText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  mapToggleArrow: { color: COLORS.textSecondary, fontSize: 16 },
  mapWrap: { marginHorizontal: 12, marginTop: 8 },
  mapNote: { color: COLORS.textTertiary, fontSize: 9, lineHeight: 13, marginTop: 5, marginHorizontal: 4 },
});
