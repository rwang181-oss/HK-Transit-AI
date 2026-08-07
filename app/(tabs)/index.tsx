import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useJourneyStore,
  type PlaceSuggestion,
  type TripPoint,
} from '@/src/stores/journeyStore';
import { useLocationStore } from '@/src/stores/locationStore';
import { useWeatherStore } from '@/src/stores/weatherStore';
import { TransitMap } from '@/src/components/TransitMap';
import { COLORS } from '@/src/utils/constants';

type Target = 'from' | 'to';

function providerSummary(item: PlaceSuggestion, translate: (key: string) => string): string {
  if (item.kind === 'place') return item.secondary || '';
  return (item.providers || []).map((provider) => translate(`providers.${provider}`)).join(' · ');
}

function localSuggestions(
  query: string,
  searchStops: ReturnType<typeof useJourneyStore.getState>['searchStops']
): PlaceSuggestion[] {
  return searchStops(query).slice(0, 8).map((hub) => ({
    id: `hub:${hub.id}`,
    kind: 'hub' as const,
    hubId: hub.id,
    lat: hub.lat,
    lng: hub.lng,
    name: hub.name_en || hub.name_tc || hub.name_sc,
    secondary: hub.name_tc || hub.name_sc,
    providers: [...new Set(hub.members.map((member) => member.provider))],
  }));
}

export default function JourneyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    status,
    error,
    dataWarnings,
    loadData,
    searchStops,
    searchAny,
  } = useJourneyStore();
  const {
    position,
    loading: locationLoading,
    requestPermission,
    getPosition,
  } = useLocationStore();
  const { weather, refresh: refreshWeather } = useWeatherStore();

  const [fromPoint, setFromPoint] = useState<TripPoint | null>(null);
  const [toPoint, setToPoint] = useState<TripPoint | null>(null);
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [activeField, setActiveField] = useState<Target | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const myLocationLabel = t('journey.myLocation');

  useEffect(() => {
    const ambientTimer = setTimeout(() => {
      void refreshWeather();
      void (async () => {
        const allowed = await requestPermission();
        if (allowed) await getPosition();
      })();
    }, 420);
    return () => {
      clearTimeout(ambientTimer);
    };
  }, [refreshWeather, requestPermission, getPosition]);

  useEffect(() => {
    if (!position || fromPoint) return;
    const point = { ...position, name: myLocationLabel };
    setFromPoint(point);
    setFromQuery(myLocationLabel);
  }, [position, fromPoint, myLocationLabel]);

  const activeQuery = activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '';

  useEffect(() => {
    let cancelled = false;
    const query = activeQuery.trim();
    if (!activeField || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    const topologyTimer = status === 'idle'
      ? setTimeout(() => void loadData(), 1_200)
      : null;
    const local = localSuggestions(query, searchStops);
    setSuggestions(local);
    setSearching(local.length === 0);

    if (local.length >= 5) {
      return () => {
        cancelled = true;
        if (topologyTimer) clearTimeout(topologyTimer);
      };
    }

    const timer = setTimeout(() => {
      setSearching(true);
      void searchAny(query)
        .then((items) => {
          if (!cancelled) setSuggestions(items.slice(0, 8));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 650);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (topologyTimer) clearTimeout(topologyTimer);
    };
  }, [activeField, activeQuery, searchStops, searchAny, status, loadData]);

  const mapPoints = useMemo(() => {
    const items: Array<{
      lat: number;
      lng: number;
      kind: 'me' | 'start' | 'end';
      label?: string;
    }> = [];
    if (position) items.push({ ...position, kind: 'me', label: myLocationLabel });
    if (fromPoint) items.push({ lat: fromPoint.lat, lng: fromPoint.lng, kind: 'start', label: fromPoint.name });
    if (toPoint) items.push({ lat: toPoint.lat, lng: toPoint.lng, kind: 'end', label: toPoint.name });
    return items;
  }, [position, fromPoint, toPoint, myLocationLabel]);

  const center = toPoint || fromPoint || position || { lat: 22.3027, lng: 114.1772 };

  const selectSuggestion = (item: PlaceSuggestion) => {
    const point: TripPoint = { lat: item.lat, lng: item.lng, name: item.name };
    if (activeField === 'from') {
      setFromPoint(point);
      setFromQuery(item.name);
    } else {
      setToPoint(point);
      setToQuery(item.name);
    }
    setActiveField(null);
    setSuggestions([]);
  };

  const selectMapPoint = (coordinate: { lat: number; lng: number }) => {
    if (!activeField) return;
    const point = { ...coordinate, name: t('journey.mapPoint') };
    if (activeField === 'from') {
      setFromPoint(point);
      setFromQuery(point.name);
    } else {
      setToPoint(point);
      setToQuery(point.name);
    }
    setActiveField(null);
  };

  const useCurrentLocation = async () => {
    const allowed = await requestPermission();
    if (!allowed) return;
    await getPosition();
    const latest = useLocationStore.getState().position;
    if (!latest) return;
    setFromPoint({ ...latest, name: myLocationLabel });
    setFromQuery(myLocationLabel);
    setActiveField(null);
  };

  const swapPoints = () => {
    setFromPoint(toPoint);
    setToPoint(fromPoint);
    setFromQuery(toPoint?.name || '');
    setToQuery(fromPoint?.name || '');
  };

  const toggleMap = () => {
    setShowMap((current) => {
      const next = !current;
      if (next && !activeField) setActiveField(!fromPoint ? 'from' : 'to');
      return next;
    });
  };

  const planJourney = () => {
    if (!fromPoint || !toPoint) return;
    const params = new URLSearchParams({
      fromLat: String(fromPoint.lat),
      fromLng: String(fromPoint.lng),
      fromName: fromPoint.name,
      toLat: String(toPoint.lat),
      toLng: String(toPoint.lng),
      toName: toPoint.name,
    });
    router.push(`/journey/result?${params.toString()}` as never);
  };

  const weatherParts = [
    weather.temperatureC == null ? null : `${Math.round(weather.temperatureC)}°`,
    weather.uvIndex == null ? null : `UV ${weather.uvIndex}`,
    t(`weather.rain.${weather.rainIntensity}`),
  ].filter(Boolean);
  const readyToPlan = Boolean(fromPoint && toPoint);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.page}>
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.eyebrow}>{t('home.cityLabel')}</Text>
              <Text style={styles.brand}>HK Transit AI</Text>
            </View>
            {weatherParts.length > 0 ? (
              <View style={styles.weatherPill}>
                <Text style={styles.weatherText}>{weatherParts.join(' · ')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.searchCard}>
            <View style={styles.routeRail}>
              <View style={styles.startDot} />
              <View style={styles.railLine} />
              <View style={styles.endDot} />
            </View>
            <View style={styles.fields}>
              <View style={styles.fieldRow}>
                <TextInput
                  accessibilityLabel={t('journey.from')}
                  value={fromQuery}
                  onFocus={() => setActiveField('from')}
                  onChangeText={(value) => {
                    setFromQuery(value);
                    setFromPoint(null);
                    setActiveField('from');
                  }}
                  placeholder={t('journey.fromPlaceholder')}
                  placeholderTextColor={COLORS.textTertiary}
                  style={[styles.input, activeField === 'from' && styles.inputActive]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('journey.myLocation')}
                  style={styles.locationButton}
                  onPress={useCurrentLocation}
                >
                  {locationLoading ? (
                    <ActivityIndicator size="small" color={COLORS.jade} />
                  ) : (
                    <Text style={styles.locationIcon}>◎</Text>
                  )}
                </Pressable>
              </View>
              <View style={styles.divider} />
              <TextInput
                accessibilityLabel={t('journey.to')}
                value={toQuery}
                onFocus={() => setActiveField('to')}
                onChangeText={(value) => {
                  setToQuery(value);
                  setToPoint(null);
                  setActiveField('to');
                }}
                placeholder={t('journey.toPlaceholder')}
                placeholderTextColor={COLORS.textTertiary}
                style={[styles.input, activeField === 'to' && styles.inputActive]}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('journey.swap')}
              style={styles.swapButton}
              onPress={swapPoints}
            >
              <Text style={styles.swapText}>⇅</Text>
            </Pressable>
          </View>

          {(searching || suggestions.length > 0) ? (
            <View style={styles.suggestionCard}>
              {suggestions.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => selectSuggestion(item)}
                  style={styles.suggestionRow}
                >
                  <View style={[styles.suggestionIcon, item.kind === 'place' && styles.placeIcon]}>
                    <Text>{item.kind === 'hub' ? '◉' : '⌖'}</Text>
                  </View>
                  <View style={styles.suggestionTextBlock}>
                    <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.suggestionMeta} numberOfLines={1}>
                      {providerSummary(item, t)}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {searching ? (
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color={COLORS.hkRed} />
                  <Text style={styles.searchingText}>{t('journey.searching')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable style={styles.mapToggle} onPress={toggleMap}>
            <Text style={styles.mapToggleIcon}>⌖</Text>
            <View style={styles.mapToggleTextBlock}>
              <Text style={styles.mapToggleTitle}>
                {showMap ? t('journey.hideMapPicker') : t('journey.showMapPicker')}
              </Text>
              {showMap ? <Text style={styles.mapToggleHint}>{t('journey.mapPickerHint')}</Text> : null}
            </View>
            <Text style={styles.mapToggleArrow}>{showMap ? '⌃' : '⌄'}</Text>
          </Pressable>

          {showMap ? (
            <View style={styles.mapFrame}>
              <TransitMap
                center={center}
                points={mapPoints}
                height={270}
                onPickPoint={selectMapPoint}
              />
            </View>
          ) : null}

          {status === 'loading' ? (
            <View style={styles.notice}>
              <ActivityIndicator size="small" color={COLORS.hkRed} />
              <Text style={styles.noticeText}>{t('journey.loadingData')}</Text>
            </View>
          ) : status === 'error' ? (
            <View style={[styles.notice, styles.errorNotice]}>
              <Text style={styles.errorText}>{t('journey.dataError')}</Text>
              <Pressable onPress={() => void loadData()}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : dataWarnings.length > 0 ? (
            <Text style={styles.warningText}>{t('journey.cachedDataNotice')}</Text>
          ) : (
            <Text style={styles.readyText}>{t('journey.routeDataReady')}</Text>
          )}

          {error ? <Text style={styles.debugError}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.fixedAction}>
        <View style={styles.fixedActionInner}>
          <Pressable
            accessibilityRole="button"
            disabled={!readyToPlan}
            onPress={planJourney}
            style={[styles.planButton, !readyToPlan && styles.planButtonDisabled]}
          >
            <Text style={styles.planButtonText}>{t('journey.planComfortRoute')}</Text>
            <Text style={styles.planArrow}>→</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  container: { flex: 1 },
  content: { paddingBottom: 20 },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  brandRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: { color: COLORS.hkRed, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  brand: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 1 },
  weatherPill: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 7,
    maxWidth: '58%',
  },
  weatherText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '600' },
  searchCard: {
    marginHorizontal: 12,
    marginTop: 4,
    backgroundColor: COLORS.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  routeRail: { width: 20, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  startDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.jade },
  railLine: { width: 2, flex: 1, minHeight: 26, backgroundColor: COLORS.border, marginVertical: 4 },
  endDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.hkRed },
  fields: { flex: 1, minWidth: 0, marginLeft: 5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    color: COLORS.textPrimary,
    fontSize: 16,
    paddingHorizontal: 9,
    borderRadius: 11,
  },
  inputActive: { backgroundColor: COLORS.bgRaised },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 9 },
  locationButton: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#E7F6F3', alignItems: 'center', justifyContent: 'center' },
  locationIcon: { color: COLORS.jade, fontSize: 21, fontWeight: '700' },
  swapButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.bgRaised, alignItems: 'center', justifyContent: 'center', marginLeft: 7 },
  swapText: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '700' },
  suggestionCard: { marginHorizontal: 12, marginTop: 7, backgroundColor: COLORS.bgCard, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  searchingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 },
  searchingText: { color: COLORS.textSecondary, fontSize: 12 },
  suggestionRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  suggestionIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#E7F6F3', alignItems: 'center', justifyContent: 'center' },
  placeIcon: { backgroundColor: COLORS.sky },
  suggestionTextBlock: { flex: 1, minWidth: 0, marginLeft: 10 },
  suggestionName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  suggestionMeta: { color: COLORS.textTertiary, fontSize: 10, marginTop: 2 },
  mapToggle: {
    marginHorizontal: 12,
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapToggleIcon: { color: COLORS.jade, fontSize: 17, width: 27 },
  mapToggleTextBlock: { flex: 1 },
  mapToggleTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  mapToggleHint: { color: COLORS.textTertiary, fontSize: 10, marginTop: 2 },
  mapToggleArrow: { color: COLORS.textSecondary, fontSize: 16 },
  mapFrame: { marginHorizontal: 12, marginTop: 8 },
  notice: { minHeight: 40, marginHorizontal: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  noticeText: { color: COLORS.textSecondary, fontSize: 11 },
  errorNotice: { justifyContent: 'space-between' },
  errorText: { color: COLORS.hkRed, fontSize: 11 },
  retryText: { color: COLORS.hkRed, fontSize: 11, fontWeight: '700' },
  warningText: { color: COLORS.etaWarning, fontSize: 10, textAlign: 'center', marginHorizontal: 18, marginTop: 9 },
  readyText: { color: COLORS.jade, fontSize: 10, textAlign: 'center', marginTop: 9 },
  debugError: { color: COLORS.hkRed, fontSize: 9, marginHorizontal: 16, marginTop: 8 },
  fixedAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bgSystem,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
  },
  fixedActionInner: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  planButton: {
    minHeight: 54,
    backgroundColor: COLORS.hkRed,
    borderRadius: 16,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  planButtonDisabled: { opacity: 0.42 },
  planButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  planArrow: { color: '#FFFFFF', fontSize: 21, marginLeft: 'auto' },
});
