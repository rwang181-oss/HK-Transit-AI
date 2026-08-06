import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/src/stores/navigationStore';
import { COLORS } from '@/src/utils/constants';

function formatClock(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-HK' : 'zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(timestamp));
}

export function LiveJourneyPanel() {
  const { t, i18n } = useTranslation();
  const {
    phase,
    option,
    destination,
    speed,
    liveArrival,
    liveWaitMinutes,
    liveCatchable,
    liveDepartureStatus,
    error,
    stop,
    advancePhase,
  } = useNavigationStore();

  if (phase === 'idle' && error) {
    return (
      <View style={[styles.panel, styles.errorPanel]}>
        <Text style={styles.error}>{t(`navigation.errors.${error}`)}</Text>
        <Pressable style={styles.dismissButton} onPress={stop}>
          <Text style={styles.dismissText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    );
  }
  if (phase === 'idle' || !option || !destination) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{t('navigation.live')}</Text>
        </View>
        <Text style={styles.phase}>{t(`navigation.phases.${phase}`)}</Text>
      </View>

      <Text style={styles.destination} numberOfLines={1}>{destination.name}</Text>
      {liveArrival ? (
        <View style={styles.arrivalRow}>
          <Text style={styles.remaining}>{liveArrival.remainingMinutes}</Text>
          <Text style={styles.remainingUnit}>{t('navigation.minutesRemaining')}</Text>
          <View style={styles.arrivalTextBlock}>
            <Text style={styles.arrivalLabel}>{t('journey.arrive')}</Text>
            <Text style={styles.arrivalTime}>
              {formatClock(liveArrival.earliestArrivalMs, i18n.language)}–
              {formatClock(liveArrival.latestArrivalMs, i18n.language)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.speedRow}>
        <Text style={styles.speedLabel}>{t('navigation.walkingSpeed')}</Text>
        <Text style={styles.speedValue}>{(speed.speedMps * 3.6).toFixed(1)} km/h</Text>
        <Text style={styles.speedConfidence}>
          {speed.acceptedSamples >= 2
            ? t('navigation.recalibrated')
            : t('navigation.collectingSpeed')}
        </Text>
      </View>

      {phase === 'walkingToTransit' || phase === 'waiting' ? (
        <View style={styles.departureCard}>
          <Text style={styles.departureText}>
            {t('navigation.dynamicWait', { minutes: Math.max(0, Math.ceil(liveWaitMinutes)) })}
          </Text>
          <Text style={styles.departureStatus}>
            {t('navigation.departureStatus', { status: t(`journey.etaStatus.${liveDepartureStatus}`) })}
          </Text>
          {!liveCatchable ? (
            <Text style={styles.adjustedDeparture}>{t('navigation.nextDepartureAdjusted')}</Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{t(`navigation.errors.${error}`)}</Text> : null}

      <View style={styles.actions}>
        {phase !== 'arrived' ? (
          <Pressable style={styles.advanceButton} onPress={advancePhase}>
            <Text style={styles.advanceText}>{t('navigation.nextStage')}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.stopButton} onPress={stop}>
          <Text style={styles.stopText}>{t('navigation.stop')}</Text>
        </Pressable>
      </View>
      <Text style={styles.foregroundNote}>{t('navigation.foregroundOnly')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: COLORS.ink,
    padding: 18,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#32D583' },
  liveText: { color: '#B7F4D8', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  phase: { color: '#D9E2EC', fontSize: 12, fontWeight: '600' },
  destination: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: 12 },
  arrivalRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12 },
  remaining: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
  remainingUnit: { color: '#D9E2EC', fontSize: 12, marginLeft: 5 },
  arrivalTextBlock: { marginLeft: 'auto', alignItems: 'flex-end' },
  arrivalLabel: { color: '#9FB3C8', fontSize: 11 },
  arrivalTime: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  speedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, gap: 8 },
  speedLabel: { color: '#9FB3C8', fontSize: 11 },
  speedValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  speedConfidence: { color: '#B7F4D8', fontSize: 10, marginLeft: 'auto' },
  departureCard: { marginTop: 13, borderRadius: 12, backgroundColor: '#243B53', padding: 11 },
  departureText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  departureStatus: { color: '#9FB3C8', fontSize: 10, marginTop: 4 },
  adjustedDeparture: { color: '#FEC84B', fontSize: 11, lineHeight: 16, marginTop: 7 },
  error: { color: '#FDA29B', fontSize: 12, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  advanceButton: { flex: 1.2, borderRadius: 13, minHeight: 42, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  advanceText: { color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  stopButton: { flex: 1, borderRadius: 13, minHeight: 42, borderWidth: 1, borderColor: '#486581', alignItems: 'center', justifyContent: 'center' },
  stopText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  foregroundNote: { color: '#829AB1', fontSize: 10, lineHeight: 15, marginTop: 11 },
  errorPanel: { backgroundColor: '#7A271A', flexDirection: 'row', alignItems: 'center', gap: 12 },
  dismissButton: { marginLeft: 'auto', borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8 },
  dismissText: { color: '#7A271A', fontSize: 12, fontWeight: '700' },
});
