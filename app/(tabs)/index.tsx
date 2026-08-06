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

export default function JourneyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { status, error, dataWarnings, loadData, searchAny } = useJourneyStore();
  const { position, loading: locationLoading, requestPermission, getPosition } = useLocationStore();
  const { weather, refresh: refreshWeather } = useWeatherStore();

  const [fromPoint, setFromPoint] = useState<TripPoint | null>(null);
  const [toPoint, setToPoint] = useState<TripPoint | null>(null);
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [activeField, setActiveField] = useState<Target | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const isEnglish = i18n.language === 'en';
  const myLocationLabel = t('journey.myLocation');

  useEffect(() => {
    loadData();
    refreshWeather();
    void (async () => {
      const allowed = await requestPermission();
      if (allowed) await getPosition();
    })();
  }, []);

  useEffect(() => {
    if (!position || fromPoint) return;
    const point = { ...position, name: myLocationLabel };
    setFromPoint(point);
    setFromQuery(myLocationLabel);
  }, [position, myLocationLabel]);

  const activeQuery = activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '';

  useEffect(() => {
    let cancelled = false;
    const query = activeQuery.trim();
    if (!activeField || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchAny(query)
        .then((items) => {
          if (!cancelled) setSuggestions(items);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeField, activeQuery, searchAny]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.eyebrow}>{t('home.cityLabel')}</Text>
            <Text style={styles.brand}>HK Transit AI</Text>
          </View>
          <View style={styles.weatherPill}>
            <Text style={styles.weatherText}>{weatherParts.join(' · ')}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>{t('journey.heroTitle')}</Text>
        <Text style={styles.heroSubtitle}>{t('journey.heroSubtitle')}</Text>

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
              <Pressable style={styles.locationButton} onPress={useCurrentLocation}>
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
          <Pressable style={styles.swapButton} onPress={swapPoints}>
            <Text style={styles.swapText}>⇅</Text>
          </Pressable>
        </View>

        {activeField ? (
          <Text style={styles.mapHint}>{t('journey.searchOrTapMap')}</Text>
        ) : null}

        {(searching || suggestions.length > 0) && (
          <View style={styles.suggestionCard}>
            {searching ? (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={COLORS.hkRed} />
                <Text style={styles.searchingText}>{t('journey.searching')}</Text>
              </View>
            ) : (
              suggestions.map((item) => (
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
              ))
            )}
          </View>
        )}

        <View style={styles.mapFrame}>
          <TransitMap
            center={center}
            points={mapPoints}
            height={330}
            onPickPoint={selectMapPoint}
          />
          <View pointerEvents="none" style={styles.mapBadge}>
            <Text style={styles.mapBadgeText}>{t('journey.localFirst')}</Text>
          </View>
        </View>

        {status === 'loading' ? (
          <View style={styles.notice}>
            <ActivityIndicator size="small" color={COLORS.hkRed} />
            <Text style={styles.noticeText}>{t('journey.loadingData')}</Text>
          </View>
        ) : status === 'error' ? (
          <View style={[styles.notice, styles.errorNotice]}>
            <Text style={styles.errorText}>{t('journey.dataError')}</Text>
            <Pressable onPress={loadData}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable>
          </View>
        ) : dataWarnings.length > 0 ? (
          <Text style={styles.warningText}>{t('journey.cachedDataNotice')}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!fromPoint || !toPoint || status !== 'ready'}
          onPress={planJourney}
          style={[
            styles.planButton,
            (!fromPoint || !toPoint || status !== 'ready') && styles.planButtonDisabled,
          ]}
        >
          <Text style={styles.planButtonText}>{t('journey.planComfortRoute')}</Text>
          <Text style={styles.planArrow}>→</Text>
        </Pressable>

        <View style={styles.promiseRow}>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseIcon}>☂</Text>
            <Text style={styles.promiseText}>{t('journey.promiseWeather')}</Text>
          </View>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseIcon}>◷</Text>
            <Text style={styles.promiseText}>{t('journey.promiseRealtime')}</Text>
          </View>
          <View style={styles.promiseItem}>
            <Text style={styles.promiseIcon}>⌁</Text>
            <Text style={styles.promiseText}>{t('journey.promiseLocal')}</Text>
          </View>
        </View>

        {error ? <Text style={styles.debugError}>{error}</Text> : null}
        <Text style={styles.languageNote}>{isEnglish ? '繁體中文及 English' : '繁體中文及 English'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  container: { flex: 1 },
  content: { paddingBottom: 36 },
  brandRow: { paddingHorizontal: 20, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: COLORS.hkRed, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  brand: { color: COLORS.textPrimary, fontSize: 19, fontWeight: '800', marginTop: 2 },
  weatherPill: { backgroundColor: COLORS.bgCard, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 11, paddingVertical: 8, maxWidth: '55%' },
  weatherText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  heroTitle: { color: COLORS.textPrimary, fontSize: 32, lineHeight: 39, fontWeight: '800', paddingHorizontal: 20, marginTop: 24, maxWidth: 560 },
  heroSubtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, paddingHorizontal: 20, marginTop: 8, maxWidth: 620 },
  searchCard: { marginHorizontal: 16, marginTop: 20, backgroundColor: COLORS.bgCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, padding: 13, flexDirection: 'row', alignItems: 'center', shadowColor: '#102A43', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 3 },
  routeRail: { width: 22, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  startDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.jade },
  railLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: COLORS.border, marginVertical: 4 },
  endDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.hkRed },
  fields: { flex: 1, marginLeft: 7 },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 45, color: COLORS.textPrimary, fontSize: 15, paddingHorizontal: 10, borderRadius: 12 },
  inputActive: { backgroundColor: COLORS.bgRaised },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 10 },
  locationButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E7F6F3', alignItems: 'center', justifyContent: 'center' },
  locationIcon: { color: COLORS.jade, fontSize: 22, fontWeight: '700' },
  swapButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.bgRaised, alignItems: 'center', justifyContent: 'center', marginLeft: 9 },
  swapText: { color: COLORS.textPrimary, fontSize: 19, fontWeight: '700' },
  mapHint: { color: COLORS.jade, fontSize: 11, fontWeight: '600', paddingHorizontal: 20, marginTop: 8 },
  suggestionCard: { marginHorizontal: 16, marginTop: 9, backgroundColor: COLORS.bgCard, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', zIndex: 5 },
  searchingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchingText: { color: COLORS.textSecondary, fontSize: 13 },
  suggestionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  suggestionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E7F6F3', alignItems: 'center', justifyContent: 'center' },
  placeIcon: { backgroundColor: COLORS.sky },
  suggestionTextBlock: { flex: 1, marginLeft: 11 },
  suggestionName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  suggestionMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  mapFrame: { marginHorizontal: 16, marginTop: 14, position: 'relative' },
  mapBadge: { position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(16,42,67,0.88)', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7 },
  mapBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  notice: { minHeight: 44, marginHorizontal: 18, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  noticeText: { color: COLORS.textSecondary, fontSize: 12 },
  errorNotice: { justifyContent: 'space-between' },
  errorText: { color: COLORS.hkRed, fontSize: 12 },
  retryText: { color: COLORS.hkRed, fontSize: 12, fontWeight: '700' },
  warningText: { color: COLORS.etaWarning, fontSize: 11, textAlign: 'center', marginHorizontal: 20, marginTop: 10 },
  planButton: { marginHorizontal: 16, marginTop: 15, minHeight: 56, backgroundColor: COLORS.hkRed, borderRadius: 18, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planButtonDisabled: { opacity: 0.4 },
  planButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  planArrow: { color: '#FFFFFF', fontSize: 23 },
  promiseRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 13 },
  promiseItem: { flex: 1, minHeight: 68, borderRadius: 16, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  promiseIcon: { fontSize: 18 },
  promiseText: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  debugError: { color: COLORS.hkRed, fontSize: 10, margin: 16 },
  languageNote: { textAlign: 'center', color: COLORS.textTertiary, fontSize: 10, marginTop: 18 },
});
