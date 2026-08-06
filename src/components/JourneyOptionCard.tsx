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

function providerIcon(provider?: string): string {
  if (provider === 'MTR') return '🚇';
  if (provider === 'GMB') return '🚐';
  return '🚌';
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
    <Pressable
      accessibilityRole="button"
      onPress={onSelect}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.topRow}>
        <View style={styles.timeBlock}>
          <Text style={styles.totalTime}>{option.totalMinutes}</Text>
          <Text style={styles.minuteLabel}>{t('eta.min')}</Text>
        </View>
        <View style={styles.topRight}>
          <View style={styles.badgeRow}>
            {rank === 0 ? (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t(`journey.modes.${mode}`)}</Text>
              </View>
            ) : null}
            {option.itinerary.isDirect ? (
              <View style={styles.directBadge}>
                <Text style={styles.directText}>{t('journey.direct')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.arrival}>{t('journey.arrive')} {arrival}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.metricPill}>
          <Text style={styles.metricIcon}>🚶</Text>
          <Text style={styles.metricText}>{Math.round(option.walkingMinutes)} {t('eta.min')}</Text>
        </View>
        <View style={styles.metricPill}>
          <Text style={styles.metricIcon}>◷</Text>
          <Text style={styles.metricText}>{option.waitMin} {t('eta.min')}</Text>
        </View>
        <View style={styles.metricPill}>
          <Text style={styles.metricIcon}>⇄</Text>
          <Text style={styles.metricText}>{option.itinerary.transfers}</Text>
        </View>
      </View>

      <View style={styles.routeLine}>
        <View style={styles.routeDot} />
        <View style={styles.routeStroke} />
        <Text style={styles.routeIcon}>{providerIcon(firstRide?.provider)}</Text>
        <View style={styles.routeStroke} />
        <View style={[styles.routeDot, styles.routeDotEnd]} />
      </View>

      {firstRide ? (
        <Text style={styles.routeTitle} numberOfLines={2}>
          {t(`providers.${firstRide.provider}`)} {formatPublicRouteCode(firstRide.provider, firstRide.route)} · {hubName(firstRide.fromHubId)} → {hubName(firstRide.toHubId)}
        </Text>
      ) : null}

      <View style={styles.comfortRow}>
        <View style={styles.comfortPill}>
          <Text style={styles.comfortText}>
            {t('journey.outdoorEstimate', { minutes: option.comfortMetrics.outdoorExposureMinutes })}
          </Text>
        </View>
        {option.comfortMetrics.indoorTransitMinutes > 0 ? (
          <View style={[styles.comfortPill, styles.indoorPill]}>
            <Text style={[styles.comfortText, styles.indoorText]}>
              {t('journey.indoorEstimate', { minutes: option.comfortMetrics.indoorTransitMinutes })}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.reason} numberOfLines={2}>
        {option.comfortMetrics.reasons
          .slice(0, 2)
          .map((reason) => t(`journey.reasons.${reason}`))
          .join(' · ')}
      </Text>

      {!option.catchable ? (
        <View style={styles.missedNotice}>
          <Text style={styles.missedNoticeText}>{t('journey.nextServiceEstimate')}</Text>
        </View>
      ) : null}

      <View style={styles.statusRow}>
        <Text style={[styles.status, option.waitStatus === 'live' && styles.statusLive]}>
          {option.waitStatus === 'live' ? '● ' : '○ '}
          {t(`journey.etaStatus.${option.waitStatus}`)}
        </Text>
        <Text style={styles.confidence}>{t('journey.estimatedComfort')}</Text>
      </View>

      {expanded ? (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🚶</Text>
            <Text style={styles.detailText}>
              {t('journey.walkToBoard', {
                minutes: Math.round(option.walkToStationMin),
                station: hubName(option.boardHub.id),
              })}
            </Text>
          </View>
          {option.itinerary.legs.map((leg, index) =>
            leg.kind === 'transfer' ? (
              <View key={`transfer-${index}`} style={styles.detailRow}>
                <Text style={styles.detailIcon}>⇄</Text>
                <Text style={styles.detailText}>
                  {t('journey.transferStep', { minutes: Math.round(leg.minutes) })}
                </Text>
              </View>
            ) : (
              <View key={`ride-${index}`} style={styles.detailRow}>
                <Text style={styles.detailIcon}>{providerIcon(leg.provider)}</Text>
                <Text style={styles.detailText}>
                  {t(`providers.${leg.provider}`)} {formatPublicRouteCode(leg.provider, leg.route)}: {hubName(leg.fromHubId)} → {hubName(leg.toHubId)}
                </Text>
              </View>
            )
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🚶</Text>
            <Text style={styles.detailText}>
              {t('journey.walkToDestination', { minutes: Math.round(option.walkFromStationMin) })}
            </Text>
          </View>
          <Pressable onPress={onOpenEta} style={styles.etaButton}>
            <Text style={styles.etaButtonText}>{t('journey.viewLiveEta')}</Text>
          </Pressable>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 2,
  },
  cardSelected: { borderColor: COLORS.jade, borderWidth: 2, padding: 17 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timeBlock: { flexDirection: 'row', alignItems: 'baseline' },
  totalTime: { fontSize: 34, lineHeight: 39, fontWeight: '800', color: COLORS.textPrimary },
  minuteLabel: { fontSize: 13, color: COLORS.textSecondary, marginLeft: 4 },
  topRight: { alignItems: 'flex-end', flex: 1, marginLeft: 12 },
  badgeRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  recommendedBadge: { backgroundColor: '#E7F6F3', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  recommendedText: { color: COLORS.jade, fontSize: 11, fontWeight: '700' },
  directBadge: { backgroundColor: COLORS.bgRaised, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  directText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  arrival: { color: COLORS.textSecondary, fontSize: 12, marginTop: 7 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  metricPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.bgRaised, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6 },
  metricIcon: { fontSize: 12 },
  metricText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  routeLine: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  routeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.jade },
  routeDotEnd: { backgroundColor: COLORS.hkRed },
  routeStroke: { flex: 1, height: 3, backgroundColor: COLORS.border, marginHorizontal: 4 },
  routeIcon: { fontSize: 16 },
  routeTitle: { marginTop: 8, color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  comfortRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 13 },
  comfortPill: { borderRadius: 10, backgroundColor: '#F1EDFF', paddingHorizontal: 9, paddingVertical: 6 },
  indoorPill: { backgroundColor: '#E7F6F3' },
  comfortText: { color: COLORS.shade, fontSize: 11, fontWeight: '600' },
  indoorText: { color: COLORS.indoor },
  reason: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
  missedNotice: { marginTop: 11, borderRadius: 10, backgroundColor: '#FFF5E8', paddingHorizontal: 10, paddingVertical: 7 },
  missedNoticeText: { color: COLORS.etaWarning, fontSize: 11, fontWeight: '600' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  status: { color: COLORS.textTertiary, fontSize: 11 },
  statusLive: { color: COLORS.etaUrgent, fontWeight: '600' },
  confidence: { color: COLORS.textTertiary, fontSize: 11, textAlign: 'right' },
  details: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 15, paddingTop: 14, gap: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailIcon: { width: 27, fontSize: 15 },
  detailText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, lineHeight: 19 },
  etaButton: { alignSelf: 'flex-start', backgroundColor: COLORS.sky, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 3 },
  etaButtonText: { color: '#175CD3', fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  secondaryButtonText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  primaryButton: { flex: 1.25, minHeight: 44, borderRadius: 14, backgroundColor: COLORS.hkRed, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
