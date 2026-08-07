import { useEffect, useState } from 'react';
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
import { useMapPickerStore } from '@/src/stores/mapPickerStore';
import { useLocationStore } from '@/src/stores/locationStore';
import { useWeatherStore } from '@/src/stores/weatherStore';
import { COLORS } from '@/src/utils/constants';

type Target = 'from' | 'to';

function providerSummary(item: PlaceSuggestion, translate: (key: string) => string): string {
  if (item.kind === 'place') return item.secondary || '';
  return (item.providers || []).map((provider) => translate(`providers.${provider}`)).join(' · ');
}

export default function JourneyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchAny = useJourneyStore((state) => state.searchAny);
  const pendingMapPick = useMapPickerStore((state) => state.pending);
  const setPendingMapPick = useMapPickerStore((state) => state.setPending);
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

  const myLocationLabel = t('journey.myLocation');

  useEffect(() => {
    const ambientTimer = setTimeout(() => {
      void refreshWeather();
      void (async () => {
        const allowed = await requestPermission();
        if (allowed) await getPosition();
      })();
    }, 250);
    return () => clearTimeout(ambientTimer);
  }, [refreshWeather, requestPermission, getPosition]);

  useEffect(() => {
    if (!position || fromPoint) return;
    const point = { ...position, name: myLocationLabel };
    setFromPoint(point);
    setFromQuery(myLocationLabel);
  }, [position, fromPoint, myLocationLabel]);

  useEffect(() => {
    if (!pendingMapPick) return;
    const point: TripPoint = {
      lat: pendingMapPick.lat,
      lng: pendingMapPick.lng,
      name: pendingMapPick.name,
    };
    if (pendingMapPick.target === 'from') {
      setFromPoint(point);
      setFromQuery(point.name);
    } else {
      setToPoint(point);
      setToQuery(point.name);
    }
    setActiveField(null);
    setSuggestions([]);
    setPendingMapPick(null);
  }, [pendingMapPick, setPendingMapPick]);

  const activeQuery = activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '';

  useEffect(() => {
    let cancelled = false;
    const query = activeQuery.trim();
    if (!activeField || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setSearching(true);
      void searchAny(query)
        .then((items) => {
          if (!cancelled) setSuggestions(items.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 420);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeField, activeQuery, searchAny]);

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

  const openMapPicker = () => {
    const target: Target = activeField || (!fromPoint ? 'from' : 'to');
    const params = new URLSearchParams({ target });
    if (fromPoint) {
      params.set('fromLat', String(fromPoint.lat));
      params.set('fromLng', String(fromPoint.lng));
    }
    if (toPoint) {
      params.set('toLat', String(toPoint.lat));
      params.set('toLng', String(toPoint.lng));
    }
    if (position) {
      params.set('myLat', String(position.lat));
      params.set('myLng', String(position.lng));
    }
    router.push(`/journey/map-picker?${params.toString()}` as never);
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
            <Text style={styles.brand}>HK Transit AI</Text>
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

          <Pressable style={styles.mapPickerButton} onPress={openMapPicker}>
            <Text style={styles.mapPickerIcon}>⌖</Text>
            <View style={styles.mapPickerTextBlock}>
              <Text style={styles.mapPickerTitle}>{t('journey.mapPicker')}</Text>
              <Text style={styles.mapPickerHint}>{t('journey.mapPickerHomeHint')}</Text>
            </View>
            <Text style={styles.mapPickerArrow}>›</Text>
          </Pressable>

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
            <Text style={styles.planButtonText}>{t('journey.searchRoutes')}</Text>
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
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brand: { color: COLORS.textPrimary, fontSize: 21, fontWeight: '800' },
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
    marginTop: 8,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
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
  mapPickerButton: {
    marginHorizontal: 12,
    marginTop: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapPickerIcon: { fontSize: 20, color: COLORS.jade, width: 30, textAlign: 'center' },
  mapPickerTextBlock: { flex: 1, marginLeft: 8 },
  mapPickerTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  mapPickerHint: { color: COLORS.textTertiary, fontSize: 10, marginTop: 3 },
  mapPickerArrow: { color: COLORS.textTertiary, fontSize: 25, marginLeft: 8 },
  suggestionCard: { marginHorizontal: 12, marginTop: 9, backgroundColor: COLORS.bgCard, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', zIndex: 5 },
  suggestionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  suggestionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#E7F6F3', alignItems: 'center', justifyContent: 'center' },
  placeIcon: { backgroundColor: COLORS.sky },
  suggestionTextBlock: { flex: 1, marginLeft: 11 },
  suggestionName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  suggestionMeta: { color: COLORS.textTertiary, fontSize: 11, marginTop: 3 },
  searchingRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchingText: { color: COLORS.textSecondary, fontSize: 13 },
  fixedAction: { backgroundColor: COLORS.bgSystem, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  fixedActionInner: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  planButton: { minHeight: 56, backgroundColor: COLORS.hkRed, borderRadius: 18, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planButtonDisabled: { opacity: 0.4 },
  planButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  planArrow: { color: '#FFFFFF', fontSize: 23 },
});
