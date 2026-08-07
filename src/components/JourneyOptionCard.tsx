import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { JourneyOption } from '@/src/stores/journeyStore';
import type { JourneyMode } from '@/src/journey/model/types';
import { COLORS } from '@/src/utils/constants';
import { formatPublicRouteCode } from '@/src/journey/providers/routeDisplay';

interface JourneyOptionCardProps {
  option: JourneyOption;
  rank: number;
  mode: JourneyMode;
  selected: boolean;
  expanded: boolean;
  hubName: (hubId: string) => string;
  onSelect: () => void;
  onToggle: () => void;
  onStart: () => void;
  onOpenEta: () => void;
}

function formatClock(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-HK' : 'zh-HK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(timestamp));
}

export function JourneyOptionCard({
  option,
  rank,
  mode,
  selected,
  expanded,
  hubName,
  onSelect,
  onToggle,
  onStart,
  onOpenEta,
}: JourneyOptionCardProps) {
  const { t, i18n } = useTranslation();
  const firstRide = option.itinerary.legs.find((leg) => leg.kind === 'ride');
  const arrival = `${formatClock(option.arrivalWindow.earliestArrivalMs, i18n.language)}–${formatClock(
    option.arrivalWindow.latestArrivalMs,
    i18n.language
  )}`;

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Pressable accessibilityRole="button" onPress={onSelect} style={styles.summaryButton}>
        <View style={styles.topRow}>
          <View style={styles.timeRow}>
            <Text style={styles.totalTime}>{option.totalMinutes}</Text>
            <Text style={styles.minuteLabel}>{t('eta.min')}</Text>
          </View>
          <View style={styles.arrivalBlock}>
            {rank === 0 ? (
              <Text style={styles.recommended}>{t(`journey.modes.${mode}`)}</Text>
            ) : null}
            <Text style={styles.arrival}>{t('journey.arrive')} {arrival}</Text>
          </View>
        </View>

        {firstRide ? (
          <Text style={styles.routeTitle} numberOfLines={2}>
            {t(`providers.${firstRide.provider}`)} {formatPublicRouteCode(firstRide.provider, firstRide.route)} · {hubName(firstRide.fromHubId)} → {hubName(firstRide.toHubId)}
          </Text>
        ) : null}

        <View style={styles.metrics}>
          <Text style={styles.metric}>{t('journey.walk')} {Math.round(option.walkingMinutes)} {t('eta.min')}</Text>
          <Text style={styles.metric}>{t('journey.wait')} {option.waitMin} {t('eta.min')}</Text>
          <Text style={styles.metric}>{t('journey.transfers')} {option.itinerary.transfers}</Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={[styles.status, option.waitStatus === 'live' && styles.statusLive]}>
            {option.waitStatus === 'live' ? '● ' : ''}{t(`journey.etaStatus.${option.waitStatus}`)}
          </Text>
          {!option.catchable ? <Text style={styles.warning}>{t('journey.nextServiceShort')}</Text> : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.stepIndex}>1</Text>
            <Text style={styles.detailText}>
              {t('journey.walkToBoard', {
                minutes: Math.round(option.walkToStationMin),
                station: hubName(option.boardHub.id),
              })}
            </Text>
          </View>
          {option.itinerary.legs.map((leg, index) => (
            <View key={`${leg.kind}-${index}`} style={styles.detailRow}>
              <Text style={styles.stepIndex}>{index + 2}</Text>
              <Text style={styles.detailText}>
                {leg.kind === 'transfer'
                  ? t('journey.transferStep', { minutes: Math.round(leg.minutes) })
                  : `${t(`providers.${leg.provider}`)} ${formatPublicRouteCode(leg.provider, leg.route)}: ${hubName(leg.fromHubId)} → ${hubName(leg.toHubId)}`}
              </Text>
            </View>
          ))}
          <View style={styles.detailRow}>
            <Text style={styles.stepIndex}>{option.itinerary.legs.length + 2}</Text>
            <Text style={styles.detailText}>
              {t('journey.walkToDestination', { minutes: Math.round(option.walkFromStationMin) })}
            </Text>
          </View>
          {option.boardStopId && option.boardRoute ? (
            <Pressable onPress={onOpenEta} style={styles.etaButton}>
              <Text style={styles.etaButtonText}>{t('journey.viewLiveEta')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Pressable onPress={onToggle} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>
            {expanded ? t('journey.hideDetails') : t('journey.showDetails')}
          </Text>
        </Pressable>
        <Pressable onPress={onStart} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('navigation.start')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: COLORS.jade, borderWidth: 2 },
  summaryButton: { padding: 15 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline' },
  totalTime: { fontSize: 29, lineHeight: 33, fontWeight: '800', color: COLORS.textPrimary },
  minuteLabel: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 4 },
  arrivalBlock: { flex: 1, alignItems: 'flex-end' },
  recommended: { color: COLORS.jade, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  arrival: { color: COLORS.textSecondary, fontSize: 11, textAlign: 'right' },
  routeTitle: { marginTop: 10, color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  metric: { color: COLORS.textSecondary, fontSize: 11, backgroundColor: COLORS.bgRaised, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  status: { color: COLORS.textTertiary, fontSize: 10 },
  statusLive: { color: COLORS.etaUrgent, fontWeight: '700' },
  warning: { color: COLORS.etaWarning, fontSize: 10, textAlign: 'right' },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, padding: 15, gap: 10, backgroundColor: COLORS.bgRaised },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepIndex: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E7F6F3', color: COLORS.jade, fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 22 },
  detailText: { flex: 1, color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  etaButton: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, paddingHorizontal: 11, paddingVertical: 8, marginTop: 2 },
  etaButtonText: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, padding: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  secondaryButton: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  secondaryButtonText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600' },
  primaryButton: { flex: 1.25, minHeight: 42, borderRadius: 12, backgroundColor: COLORS.hkRed, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
