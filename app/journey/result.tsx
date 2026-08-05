import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useJourneyStore } from '@/src/stores/journeyStore';
import type { Itinerary, ItineraryLeg } from '@/src/journey/planner/planner';
import { COLORS } from '@/src/utils/constants';

function LegName({
  hubId,
  isEN,
  getHubById,
}: {
  hubId: string;
  isEN: boolean;
  getHubById: (id: string) => any;
}) {
  const h = getHubById(hubId);
  if (!h) return null;
  const name = isEN ? h.name_en : h.name_tc || h.name_sc;
  return <Text style={styles.legName}>{name}</Text>;
}

function ExpandedLeg({ leg, isEN, getHubById }: { leg: ItineraryLeg; isEN: boolean; getHubById: any }) {
  const from = getHubById(leg.fromHubId);
  const to = getHubById(leg.toHubId);
  if (leg.kind === 'transfer') {
    return (
      <View style={styles.detailRow}>
        <Text style={styles.detailLabel}>🚶 步行</Text>
        <Text style={styles.detailValue}>
          {Math.round(leg.minutes)} 分鐘
        </Text>
      </View>
    );
  }
  const fromName = isEN ? from?.name_en : from?.name_tc || from?.name_sc;
  const toName = isEN ? to?.name_en : to?.name_tc || to?.name_sc;
  return (
    <View style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailProvider}>{leg.provider}</Text>
        <Text style={styles.detailRoute}>{leg.route}</Text>
        <Text style={styles.detailTime}>≈ {Math.round(leg.minutes)} 分鐘</Text>
      </View>
      <View style={styles.detailStops}>
        <Text style={styles.detailStop} numberOfLines={2}>
          ① {fromName}
        </Text>
        <Text style={styles.detailArrow}>↓</Text>
        <Text style={styles.detailStop} numberOfLines={2}>
          ② {toName}
        </Text>
      </View>
    </View>
  );
}

export default function JourneyResultScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const { status, loadData, getHubById, plan } = useJourneyStore();
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(0);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (status === 'ready' && from && to) {
      setItineraries(plan(from, to));
    }
  }, [status, from, to]);

  const fromHub = getHubById(from || '');
  const toHub = getHubById(to || '');
  const fromName = fromHub
    ? isEN
      ? fromHub.name_en
      : fromHub.name_tc || fromHub.name_sc
    : '?';
  const toName = toHub
    ? isEN
      ? toHub.name_en
      : toHub.name_tc || toHub.name_sc
    : '?';

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.hkRed} />
        <Text style={styles.loadingText}>{t('journey.loading')}</Text>
      </View>
    );
  }

  const list = itineraries ?? [];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{ title: t('journey.title'), headerBackTitle: ' ' }}
      />
      <View style={styles.header}>
        <Text style={styles.routeSummary} numberOfLines={2}>
          {fromName} → {toName}
        </Text>
      </View>

      <ScrollView style={styles.list}>
        {list.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.noResult}>{t('journey.noResult')}</Text>
          </View>
        ) : (
          list.map((itin, idx) => (
            <Pressable
              key={idx}
              style={[styles.card, idx === 0 && styles.cardFastest]}
              onPress={() => setExpanded(expanded === idx ? null : idx)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.totalTime}>
                  {itin.totalMinutes} {t('eta.min')}
                </Text>
                <View style={styles.badges}>
                  {idx === 0 && (
                    <View style={styles.fastestBadge}>
                      <Text style={styles.fastestText}>
                        {t('journey.fastest')}
                      </Text>
                    </View>
                  )}
                  {itin.isDirect && (
                    <View style={styles.directBadge}>
                      <Text style={styles.directText}>
                        {t('journey.direct')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {itin.transfers > 0 && (
                <Text style={styles.transferNote}>
                  {t('journey.transfer', { count: itin.transfers })}
                </Text>
              )}

              {/* Collapsed: summary chips */}
              {expanded !== idx && (
                <View style={styles.chips}>
                  {itin.legs
                    .filter((l) => l.kind === 'ride')
                    .map((leg, i) => (
                      <View key={i} style={styles.chip}>
                        <Text style={styles.chipText}>
                          {t(`providers.${leg.provider}`)} {leg.route}
                        </Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Expanded: detailed step-by-step */}
              {expanded === idx && (
                <View style={styles.expanded}>
                  {itin.legs.map((leg, i) => (
                    <ExpandedLeg
                      key={i}
                      leg={leg}
                      isEN={isEN}
                      getHubById={getHubById}
                    />
                  ))}
                </View>
              )}

              <Text style={styles.tapHint}>
                {expanded === idx
                  ? '▲'
                  : isEN
                    ? 'Tap for details ▼'
                    : '點開查看詳情 ▼'}
              </Text>
            </Pressable>
          ))
        )}
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
  routeSummary: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
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
  cardFastest: {
    borderWidth: 2,
    borderColor: COLORS.hkRed,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  transferNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600' },
  expanded: { marginTop: 8 },
  detailCard: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailProvider: { fontSize: 13, color: COLORS.textSecondary },
  detailRoute: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.hkRed,
    marginHorizontal: 8,
  },
  detailTime: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 'auto' },
  detailStops: {},
  detailStop: { fontSize: 15, color: COLORS.textPrimary },
  detailArrow: { fontSize: 12, color: COLORS.textSecondary, marginVertical: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: COLORS.bgSystem,
    borderRadius: 8,
    marginBottom: 6,
  },
  detailLabel: { fontSize: 14, color: COLORS.etaWarning },
  detailValue: { fontSize: 14, color: COLORS.textPrimary },
  legName: { fontSize: 15, color: COLORS.textPrimary },
  noResult: { fontSize: 17, color: COLORS.textSecondary },
  estimateNote: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  tapHint: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
