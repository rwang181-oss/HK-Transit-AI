import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LiveJourneyPanel } from '@/src/components/LiveJourneyPanel';
import { TransitMap } from '@/src/components/TransitMap';
import { buildNavigationMapModel } from '@/src/journey/realtime/navigationMapModel';
import { resolveNavigationTarget } from '@/src/journey/realtime/navigationProgress';
import { createLiveRouteController } from '@/src/journey/realtime/liveRouteController';
import { walkingRouter, type WalkingRoute } from '@/src/journey/walking/walkingRouter';
import { useNavigationStore } from '@/src/stores/navigationStore';
import { COLORS } from '@/src/utils/constants';

interface NavigationModalProps {
  visible: boolean;
  starting: boolean;
  onClose: () => void;
}

export function NavigationModal({ visible, starting, onClose }: NavigationModalProps) {
  const { t } = useTranslation();
  const {
    option,
    destination,
    phase,
    activeLegIndex,
    currentPosition,
    error,
  } = useNavigationStore();
  const [liveRoute, setLiveRoute] = useState<WalkingRoute | null>(null);
  const controllerRef = useRef<ReturnType<typeof createLiveRouteController> | null>(null);
  const routeContextRef = useRef('');
  const target = useMemo(
    () => option && destination
      ? resolveNavigationTarget(
          { phase, activeLegIndex },
          option.itinerary.legs,
          destination
        )
      : null,
    [option, destination, phase, activeLegIndex]
  );
  const mapModel = useMemo(() => buildNavigationMapModel({
    phase,
    currentPosition,
    target,
    liveRoute,
    optionGeometry: option?.geometry ?? [],
    currentPositionLabel: t('navigation.youAreHere'),
  }), [phase, currentPosition, target, liveRoute, option, t]);

  useEffect(() => {
    if (!visible) return undefined;
    const controller = createLiveRouteController(
      (from, to) => walkingRouter.route(from, to),
      setLiveRoute
    );
    controllerRef.current = controller;
    routeContextRef.current = '';
    return () => {
      controller.reset();
      if (controllerRef.current === controller) controllerRef.current = null;
      routeContextRef.current = '';
      setLiveRoute(null);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const routeContext = target
      ? [phase, target.kind, target.id, target.lat, target.lng].join(':')
      : phase;
    if (routeContext !== routeContextRef.current) {
      routeContextRef.current = routeContext;
      setLiveRoute(null);
    }
    const walkingPhase = phase === 'walkingToTransit'
      || phase === 'walkingTransfer'
      || phase === 'walkingToDestination';
    const validPosition = currentPosition
      && Number.isFinite(currentPosition.lat)
      && Number.isFinite(currentPosition.lng)
      && currentPosition.lat >= -90
      && currentPosition.lat <= 90
      && currentPosition.lng >= -180
      && currentPosition.lng <= 180;
    if (!walkingPhase || !validPosition || !target) {
      controllerRef.current?.reset();
      return;
    }
    controllerRef.current?.update({
      phase,
      position: currentPosition,
      target,
    });
  }, [visible, phase, currentPosition, target]);

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{t('navigation.live')}</Text>
            <Text style={styles.title}>{t('journey.navigationSheetTitle')}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {visible && target && mapModel.center ? (
            <View style={styles.mapCard}>
              <TransitMap
                center={mapModel.center}
                points={mapModel.points}
                paths={mapModel.paths}
                height={360}
                followPoint={currentPosition}
                followZoom={17}
              />
              <View style={styles.mapStatus}>
                <View style={styles.targetTextBlock}>
                  <Text style={styles.mapStatusLabel}>{t('navigation.nextTarget')}</Text>
                  <Text style={styles.mapStatusValue} numberOfLines={1}>
                    {target?.name ?? '—'}
                  </Text>
                </View>
                <View style={styles.routeStatus}>
                  {error ? (
                    <Text style={[styles.routeStatusText, styles.locationErrorStatus]}>
                      {t(`navigation.errors.${error}`)}
                    </Text>
                  ) : !currentPosition ? (
                    <>
                      <ActivityIndicator size="small" color={COLORS.hkRed} />
                      <Text style={styles.routeStatusText}>{t('navigation.locating')}</Text>
                    </>
                  ) : mapModel.routeSource ? (
                    <Text style={[
                      styles.routeStatusText,
                      mapModel.routeSource === 'estimated' && styles.estimatedStatus,
                    ]}>
                      {t(mapModel.routeSource === 'estimated'
                        ? 'navigation.estimatedRoute'
                        : 'navigation.routedPath')}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : option ? (
            <View style={styles.unavailableCard}>
              <Text style={styles.mapStatusLabel}>{t('navigation.nextTarget')}</Text>
              <Text style={styles.unavailableText}>{t('navigation.targetUnavailable')}</Text>
            </View>
          ) : null}
          {starting && !error ? (
            <View style={styles.startingCard}>
              <ActivityIndicator size="small" color={COLORS.hkRed} />
              <View style={styles.startingTextBlock}>
                <Text style={styles.startingTitle}>{t('navigation.starting')}</Text>
                <Text style={styles.startingText}>{t('journey.locationNeeded')}</Text>
              </View>
            </View>
          ) : null}
          <LiveJourneyPanel embedded />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bgSystem },
  header: {
    minHeight: 68,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  eyebrow: { color: COLORS.hkRed, fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 2 },
  closeButton: { minHeight: 40, minWidth: 62, borderRadius: 12, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  closeText: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 680, alignSelf: 'center' },
  mapCard: { borderRadius: 20, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  mapStatus: { minHeight: 66, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  targetTextBlock: { flex: 1, minWidth: 0 },
  mapStatusLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  mapStatusValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 3 },
  routeStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 7, maxWidth: '48%' },
  routeStatusText: { color: '#176B4D', fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'right' },
  estimatedStatus: { color: '#9A6700' },
  locationErrorStatus: { color: '#B42318' },
  unavailableCard: { minHeight: 84, borderRadius: 16, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', paddingHorizontal: 18 },
  unavailableText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  startingCard: { minHeight: 72, borderRadius: 16, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 14 },
  startingTextBlock: { flex: 1 },
  startingTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  startingText: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
});
