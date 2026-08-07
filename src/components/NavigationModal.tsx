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
import { COLORS } from '@/src/utils/constants';

interface NavigationModalProps {
  visible: boolean;
  starting: boolean;
  onClose: () => void;
}

export function NavigationModal({ visible, starting, onClose }: NavigationModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
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
          {starting ? (
            <View style={styles.startingCard}>
              <ActivityIndicator size="large" color={COLORS.hkRed} />
              <Text style={styles.startingTitle}>{t('navigation.starting')}</Text>
              <Text style={styles.startingText}>{t('journey.locationNeeded')}</Text>
            </View>
          ) : (
            <LiveJourneyPanel embedded />
          )}
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
  content: { padding: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  startingCard: { minHeight: 250, borderRadius: 20, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', padding: 28 },
  startingTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '700', marginTop: 18 },
  startingText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
