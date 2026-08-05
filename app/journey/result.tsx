import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useJourneyStore } from '@/src/stores/journeyStore';
import type { Itinerary } from '@/src/journey/planner/planner';
import { COLORS } from '@/src/utils/constants';

export default function JourneyResultScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const { from, to } = useLocalSearchParams<{ from: string; to: string }>();
  const { status, loadData, getHubById, plan } = useJourneyStore();
  const [itineraries, setItineraries] = useState<Itinerary[] | null>(null);

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
  const fromName = fromHub ? (isEN ? fromHub.name_en : fromHub.name_tc) : '?';
  const toName = toHub ? (isEN ? toHub.name_en : toHub.name_tc) : '?';

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
            <View
              key={idx}
              style={[styles.card, idx === 0 && styles.cardFastest]}
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

              {itin.legs.map((leg, i) => {
                const name = isEN ? leg.fromName : leg.fromName;
                const toL = isEN ? leg.toName : leg.toName;
                if (leg.kind === 'transfer') {
                  return (
                    <View key={i} style={styles.transferLeg}>
                      <Text style={styles.transferLegText}>
                        ⇄ {Math.round(leg.minutes)} {t('eta.min')}
                      </Text>
                    </View>
                  );
                }
                return (
                  <View key={i} style={styles.rideLeg}>
                    <View style={styles.modeChip}>
                      <Text style={styles.modeText}>
                        {t(`providers.${leg.provider}`)}
                      </Text>
                    </View>
                    <Text style={styles.routeNum}>{leg.route}</Text>
                    <View style={styles.legInfo}>
                      <Text style={styles.legName} numberOfLines={1}>
                        {name} → {toL}
                      </Text>
                      <Text style={styles.legTime}>
                        {Math.round(leg.minutes)} {t('eta.min')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
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
  rideLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
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
  routeNum: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.hkRed,
    width: 52,
  },
  legInfo: { flex: 1 },
  legName: { fontSize: 15, color: COLORS.textPrimary },
  legTime: { fontSize: 13, color: COLORS.textSecondary, marginTop: 1 },
  transferLeg: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  transferLegText: { fontSize: 13, color: COLORS.etaWarning, fontWeight: '600' },
  noResult: { fontSize: 17, color: COLORS.textSecondary },
  estimateNote: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
});
