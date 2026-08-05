import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useJourneyStore, type TripPoint } from '@/src/stores/journeyStore';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { useLocationStore } from '@/src/stores/locationStore';
import { TransitMap } from '@/src/components/TransitMap';
import { COLORS } from '@/src/utils/constants';

type Target = 'from' | 'to';

export default function JourneyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isEN = i18n.language === 'en';
  const { status, loadData, searchAny, getHubById } = useJourneyStore();
  const { position, requestPermission, permissionGranted, getPosition } =
    useLocationStore();

  const [fromPoint, setFromPoint] = useState<TripPoint | null>(null);
  const [toPoint, setToPoint] = useState<TripPoint | null>(null);
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [activeField, setActiveField] = useState<Target | null>(null);
  const [debouncedFrom, setDebouncedFrom] = useState('');
  const [debouncedTo, setDebouncedTo] = useState('');
  const [suggestions, setSuggestions] = useState<StopHub[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadData();
    requestPermission().then((ok) => {
      if (ok) getPosition();
    });
  }, []);

  // Set start = current location once GPS arrives (if user hasn't picked)
  useEffect(() => {
    if (position && !fromPoint) {
      setFromPoint({
        lat: position.lat,
        lng: position.lng,
        name: isEN ? 'My location' : '我的位置',
      });
    }
  }, [position]);

  // Debounce + run searchAny (station fuzzy → geocode)
  useEffect(() => {
    if (activeField === 'from') {
      const id = setTimeout(() => setDebouncedFrom(fromQuery), 400);
      return () => clearTimeout(id);
    }
    if (activeField === 'to') {
      const id = setTimeout(() => setDebouncedTo(toQuery), 400);
      return () => clearTimeout(id);
    }
  }, [fromQuery, toQuery, activeField]);

  const activeQuery = activeField === 'from' ? debouncedFrom : debouncedTo;

  useEffect(() => {
    let cancelled = false;
    if (!activeField || !activeQuery.trim()) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    searchAny(activeQuery).then((hits) => {
      if (!cancelled) {
        setSuggestions(hits);
        setSearching(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeField, activeQuery]);

  const hubName = (h: StopHub | null) =>
    h ? (isEN ? h.name_en : h.name_tc || h.name_sc) : '';

  const pickHub = (hub: StopHub) => {
    const pt: TripPoint = {
      lat: hub.lat || 0,
      lng: hub.lng || 0,
      name: hubName(hub),
    };
    if (activeField === 'from') {
      setFromPoint(pt);
      setFromQuery(hubName(hub));
    } else if (activeField === 'to') {
      setToPoint(pt);
      setToQuery(hubName(hub));
    }
    setActiveField(null);
    setSuggestions([]);
  };

  const pickMapPoint = (p: { lat: number; lng: number }) => {
    const pt: TripPoint = {
      lat: p.lat,
      lng: p.lng,
      name: isEN ? 'Map point' : '地圖選點',
    };
    if (activeField === 'from') {
      setFromPoint(pt);
      setFromQuery(isEN ? 'Map point' : '地圖選點');
    } else if (activeField === 'to') {
      setToPoint(pt);
      setToQuery(isEN ? 'Map point' : '地圖選點');
    }
  };

  const useMyLocation = () => {
    requestPermission().then((ok) => {
      if (ok) {
        getPosition();
        setTimeout(() => {
          if (position) {
            setFromPoint({
              lat: position.lat,
              lng: position.lng,
              name: isEN ? 'My location' : '我的位置',
            });
            setFromQuery(isEN ? 'My location' : '我的位置');
          }
        }, 600);
      }
    });
  };

  const handleSwap = () => {
    setFromPoint(toPoint);
    setToPoint(fromPoint);
    setFromQuery(toPoint?.name || '');
    setToQuery(fromPoint?.name || '');
  };

  const handlePlan = () => {
    if (fromPoint && toPoint) {
      router.push(
        `/journey/result?fromLat=${fromPoint.lat}&fromLng=${fromPoint.lng}&fromName=${encodeURIComponent(fromPoint.name)}&toLat=${toPoint.lat}&toLng=${toPoint.lng}&toName=${encodeURIComponent(toPoint.name)}` as any
      );
    }
  };

  const mapPoints = [];
  if (position) mapPoints.push({ lat: position.lat, lng: position.lng, kind: 'me' as const });
  if (fromPoint) mapPoints.push({ lat: fromPoint.lat, lng: fromPoint.lng, kind: 'start' as const, label: fromPoint.name });
  if (toPoint) mapPoints.push({ lat: toPoint.lat, lng: toPoint.lng, kind: 'end' as const, label: toPoint.name });

  const mapCenter = toPoint || fromPoint || position || { lat: 22.3027, lng: 114.1772 };

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.inputCard}>
          {/* From */}
          <Text style={styles.fieldLabel}>{t('journey.from')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, activeField === 'from' && styles.inputActive]}
              value={fromQuery}
              onChangeText={(v) => {
                setFromQuery(v);
                setFromPoint(null);
                setActiveField('from');
              }}
              onFocus={() => setActiveField('from')}
              placeholder={t('journey.fromPlaceholder')}
              placeholderTextColor={COLORS.textSecondary}
            />
            <Pressable style={styles.iconBtn} onPress={useMyLocation}>
              <Text style={styles.iconText}>📍</Text>
            </Pressable>
          </View>

          {/* Swap */}
          <Pressable style={styles.swapBtn} onPress={handleSwap}>
            <Text style={styles.swapText}>⇅</Text>
          </Pressable>

          {/* To */}
          <Text style={styles.fieldLabel}>{t('journey.to')}</Text>
          <TextInput
            style={[styles.input, activeField === 'to' && styles.inputActive]}
            value={toQuery}
            onChangeText={(v) => {
              setToQuery(v);
              setToPoint(null);
              setActiveField('to');
            }}
            onFocus={() => setActiveField('to')}
            placeholder={t('journey.toPlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
          />

          {/* Suggestions */}
          {activeField && suggestions.length > 0 && (
            <View style={styles.suggestBox}>
              {suggestions.map((hub) => (
                <Pressable
                  key={hub.id}
                  style={styles.resultItem}
                  onPress={() => pickHub(hub)}
                >
                  <Text style={styles.resultName}>
                    {isEN ? hub.name_en : hub.name_tc || hub.name_sc}
                  </Text>
                  {hub.lat ? (
                    <Text style={styles.resultMeta}>
                      {hub.members
                        .map((m) => t(`providers.${m.provider}`))
                        .join(' · ')}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            style={[
              styles.planBtn,
              !(fromPoint && toPoint) && styles.planBtnDisabled,
            ]}
            onPress={handlePlan}
            disabled={!(fromPoint && toPoint)}
          >
            <Text style={styles.planBtnText}>{t('journey.plan')}</Text>
          </Pressable>
        </View>

        {/* Map */}
        <View style={styles.mapWrap}>
          <TransitMap
            center={mapCenter}
            points={mapPoints}
            height={220}
            onPickPoint={(p) => {
              if (activeField) pickMapPoint(p);
            }}
          />
          <Text style={styles.mapHint}>
            {activeField
              ? isEN
                ? 'Tap the map to pick a point'
                : '點擊地圖選取位置'
              : isEN
                ? 'Tap a field then tap the map'
                : '先選輸入框，再點擊地圖選點'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  inputCard: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: COLORS.bgSystem,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.textPrimary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputActive: { borderColor: COLORS.hkRed },
  iconBtn: { padding: 10, marginLeft: 6 },
  iconText: { fontSize: 20 },
  swapBtn: { alignSelf: 'center', padding: 8, marginVertical: 6 },
  swapText: { fontSize: 22, color: COLORS.hkRed },
  suggestBox: { marginTop: 8 },
  resultItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.bgSystem,
    marginBottom: 6,
  },
  resultName: { fontSize: 16, color: COLORS.textPrimary },
  resultMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  planBtn: {
    backgroundColor: COLORS.hkRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  planBtnDisabled: { opacity: 0.4 },
  planBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  mapWrap: { marginHorizontal: 16, marginBottom: 24 },
  mapHint: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
});
