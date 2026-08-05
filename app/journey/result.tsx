import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useJourneyStore,
  type JourneyOption,
} from '@/src/stores/journeyStore';
import { TransitMap } from '@/src/components/TransitMap';
import { COLORS } from '@/src/utils/constants';

export default function JourneyResultScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const router = useRouter();
  const { status, loadData, getHubById, plan } = useJourneyStore();

  const params = useLocalSearchParams<{
    fromLat: string;
    fromLng: string;
    fromName: string;
    toLat: string;
    toLng: string;
    toName: string;
  }>();

  const [options, setOptions] = useState<JourneyOption[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [planning, setPlanning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'direct' | 'transfer'>('all');

  const fromPoint = {
    lat: parseFloat(params.fromLat || '0'),
    lng: parseFloat(params.fromLng || '0'),
    name: decodeURIComponent(params.fromName || ''),
  };
  const toPoint = {
    lat: parseFloat(params.toLat || '0'),
    lng: parseFloat(params.toLng || '0'),
    name: decodeURIComponent(params.toName || ''),
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (status === 'ready' && !options && !planning) {
      setPlanning(true);
      plan(fromPoint, toPoint).then((o) => {
        setOptions(o);
        setPlanning(false);
      });
    }
  }, [status]);

  const hubName = (hubId: string) => {
    const h = getHubById(hubId);
    return h ? (isEN ? h.name_en : h.name_tc || h.name_sc) : '';
  };

  const openStopEta = (opt: JourneyOption) => {
    if (!opt.boardStopId || !opt.boardRoute) return;
    router.push(
      `/journey/stop-eta?provider=${opt.boardProvider}&route=${opt.boardRoute}&stopId=${opt.boardStopId}&name=${encodeURIComponent(hubName(opt.boardHub.id) || opt.boardHub.name_tc || '')}` as any
    );
  };

  const openNavigation = (opt: JourneyOption) => {
    // Walking navigation to the boarding stop via Google Maps
    const dest = `${opt.boardHub.lat},${opt.boardHub.lng}`;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`
    ).catch(() => {});
  };

  if (status === 'loading' || (planning && !options)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.hkRed} />
        <Text style={styles.loadingText}>{t('journey.loading')}</Text>
      </View>
    );
  }

  const allOptions = options ?? [];
  const list = allOptions.filter((o) => {
    if (filter === 'direct') return o.itinerary.isDirect;
    if (filter === 'transfer') return !o.itinerary.isDirect;
    return true;
  });

  const filterChips: { key: 'all' | 'direct' | 'transfer'; label: string }[] = [
    { key: 'all', label: isEN ? 'All' : '全部' },
    { key: 'direct', label: isEN ? 'Direct' : '直達' },
    { key: 'transfer', label: isEN ? 'Transfer' : '換乘' },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: t('journey.title'), headerBackTitle: ' ' }}
      />
      <View style={styles.header}>
        <Text style={styles.routeSummary} numberOfLines={2}>
          {fromPoint.name} → {toPoint.name}
        </Text>
      </View>

      {/* Direct / Transfer filter */}
      {allOptions.length > 0 && (
        <View style={styles.filterBar}>
          {filterChips.map((c) => (
            <Pressable
              key={c.key}
              style={[
                styles.filterChip,
                filter === c.key && styles.filterChipActive,
              ]}
              onPress={() => setFilter(c.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === c.key && styles.filterTextActive,
                ]}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView style={styles.list}>
        {list.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.noResult}>{t('journey.noResult')}</Text>
          </View>
        ) : (
          list.map((opt, idx) => {
            const firstRide = opt.itinerary.legs.find((l) => l.kind === 'ride');
            return (
              <View
                key={opt.id}
                style={[styles.card, idx === 0 && styles.cardFastest]}
              >
                {/* Header — tap toggles expand/collapse */}
                <Pressable
                  onPress={() => setExpanded(expanded === idx ? null : idx)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.totalTime}>
                      {opt.totalMinutes} {t('eta.min')}
                    </Text>
                    <View style={styles.badges}>
                      {idx === 0 && (
                        <View style={styles.fastestBadge}>
                          <Text style={styles.fastestText}>
                            {t('journey.fastest')}
                          </Text>
                        </View>
                      )}
                      {opt.itinerary.isDirect && (
                        <View style={styles.directBadge}>
                          <Text style={styles.directText}>
                            {t('journey.direct')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>

                {/* Steps summary */}
                <View style={styles.steps}>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepIcon}>🚶</Text>
                    <Text style={styles.stepText}>
                      {Math.round(opt.walkToStationMin)}{' '}
                      {isEN ? 'min walk to station' : '分鐘步行到車站'}
                      {firstRide ? `（${firstRide.route}）` : ''}
                    </Text>
                  </View>
                  {firstRide && (
                    <Pressable
                      style={styles.stepRow}
                      onPress={() => openStopEta(opt)}
                    >
                      <Text style={styles.stepIcon}>🚌</Text>
                      <Text style={[styles.stepText, styles.busLine]}>
                        {opt.boardProvider} {firstRide.route} →
                        {hubName(firstRide.toHubId)}
                      </Text>
                      <Text style={styles.nextBus}>
                        {opt.nextBusMin > 0
                          ? `${opt.nextBusMin} ${t('eta.min')}`
                          : '—'}
                      </Text>
                    </Pressable>
                  )}
                  <View style={styles.stepRow}>
                    <Text style={styles.stepIcon}>🚶</Text>
                    <Text style={styles.stepText}>
                      {Math.round(opt.walkFromStationMin)}{' '}
                      {isEN ? 'min walk to destination' : '分鐘步行到目的地'}
                    </Text>
                  </View>
                </View>

                {/* Catch-the-bus verdict */}
                {firstRide && (
                  <View
                    style={[
                      styles.verdict,
                      opt.catchable ? styles.verdictOk : styles.verdictWarn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.verdictText,
                        opt.catchable
                          ? styles.verdictTextOk
                          : styles.verdictTextWarn,
                      ]}
                    >
                      {opt.catchable
                        ? isEN
                          ? `You can make it (walk ${Math.round(opt.walkToStationMin)} min, bus in ${opt.nextBusMin} min)`
                          : `可以趕上（步行 ${Math.round(opt.walkToStationMin)} 分鐘，巴士 ${opt.nextBusMin} 分鐘後到）`
                        : isEN
                          ? `You'll miss it — walk ${Math.round(opt.walkToStationMin)} min but bus is only ${opt.nextBusMin} min away`
                          : `趕不上 — 步行需 ${Math.round(opt.walkToStationMin)} 分鐘，巴士 ${opt.nextBusMin} 分鐘後到，建議提前出發`}
                    </Text>
                  </View>
                )}

                {/* Expanded: full legs */}
                {expanded === idx && (
                  <View style={styles.expanded}>
                    {opt.itinerary.legs.map((leg, i) => {
                      if (leg.kind === 'transfer') {
                        return (
                          <View key={i} style={styles.transferLeg}>
                            <Text style={styles.transferText}>
                              ⇄ {Math.round(leg.minutes)} {t('eta.min')}
                            </Text>
                          </View>
                        );
                      }
                      const fromName = hubName(leg.fromHubId);
                      const toName = hubName(leg.toHubId);
                      return (
                        <Pressable
                          key={i}
                          style={styles.rideLeg}
                          onPress={() => openStopEta(opt)}
                        >
                          <View style={styles.modeChip}>
                            <Text style={styles.modeText}>
                              {t(`providers.${leg.provider}`)}
                            </Text>
                          </View>
                          <Text style={styles.routeNum}>{leg.route}</Text>
                          <View style={styles.legInfo}>
                            <Text style={styles.legName} numberOfLines={1}>
                              {fromName} → {toName}
                            </Text>
                            <Text style={styles.legTime}>
                              ≈ {Math.round(leg.minutes)} {t('eta.min')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Action row: navigate + expand toggle */}
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.navBtn}
                    onPress={() => openNavigation(opt)}
                  >
                    <Text style={styles.navBtnText}>
                      {isEN ? '🧭 Walk to station' : '🧭 前往車站'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.toggleBtn}
                    onPress={() => setExpanded(expanded === idx ? null : idx)}
                  >
                    <Text style={styles.toggleText}>
                      {expanded === idx
                        ? '▲'
                        : isEN
                          ? 'Details ▼'
                          : '詳情 ▼'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {/* Map */}
        <View style={styles.mapWrap}>
          <TransitMap
            center={{ lat: (fromPoint.lat + toPoint.lat) / 2, lng: (fromPoint.lng + toPoint.lng) / 2 }}
            points={[
              { lat: fromPoint.lat, lng: fromPoint.lng, kind: 'start', label: fromPoint.name },
              { lat: toPoint.lat, lng: toPoint.lng, kind: 'end', label: toPoint.name },
            ]}
            height={200}
          />
        </View>

        <Text style={styles.estimateNote}>{t('journey.estimates')}</Text>
      </ScrollView>
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
  loadingText: { fontSize: 15, color: COLORS.textSecondary, marginTop: 10 },
  header: {
    backgroundColor: COLORS.bgCard,
    padding: 16,
    margin: 16,
    borderRadius: 16,
  },
  routeSummary: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  list: { flex: 1 },
  card: {
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardFastest: { borderWidth: 2, borderColor: COLORS.hkRed },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  totalTime: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
  badges: { flexDirection: 'row', gap: 6 },
  fastestBadge: {
    backgroundColor: COLORS.hkRed,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fastestText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  directBadge: {
    backgroundColor: COLORS.etaUrgent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  directText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  steps: { gap: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepIcon: { fontSize: 16, width: 26 },
  stepText: { fontSize: 15, color: COLORS.textPrimary, flex: 1 },
  busLine: { fontWeight: '600', color: COLORS.hkRed },
  nextBus: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  verdict: {
    marginTop: 10,
    borderRadius: 10,
    padding: 10,
  },
  verdictOk: { backgroundColor: '#E8F8EF' },
  verdictWarn: { backgroundColor: '#FFF3E0' },
  verdictText: { fontSize: 13, fontWeight: '600' },
  verdictTextOk: { color: '#1B873F' },
  verdictTextWarn: { color: '#B26A00' },
  expanded: { marginTop: 10 },
  rideLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  modeChip: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  modeText: { fontSize: 12, color: COLORS.textPrimary, fontWeight: '600' },
  routeNum: { fontSize: 18, fontWeight: '700', color: COLORS.hkRed, width: 52 },
  legInfo: { flex: 1 },
  legName: { fontSize: 15, color: COLORS.textPrimary },
  legTime: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  transferLeg: { paddingVertical: 6, alignItems: 'center' },
  transferText: { fontSize: 13, color: COLORS.etaWarning, fontWeight: '600' },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  filterChipActive: {
    backgroundColor: COLORS.hkRed,
    borderColor: COLORS.hkRed,
  },
  filterText: { fontSize: 14, color: COLORS.textPrimary },
  filterTextActive: { color: '#FFFFFF', fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#E8F8EF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  navBtnText: { fontSize: 14, fontWeight: '600', color: '#1B873F' },
  toggleBtn: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  noResult: { fontSize: 17, color: COLORS.textSecondary },
  mapWrap: { marginHorizontal: 16, marginTop: 8, marginBottom: 16 },
  estimateNote: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
});
