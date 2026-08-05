import { View, Text, StyleSheet } from 'react-native';
import type { ETA } from '@/src/services/kmbAPI';
import { getETADisplay } from '@/src/utils/formatters';
import { COLORS } from '@/src/utils/constants';

interface ETARowProps {
  eta: ETA;
  isUrgent?: boolean;
}

export function ETARow({ eta, isUrgent }: ETARowProps) {
  const { minutes, text } = getETADisplay(eta);
  const color =
    isUrgent || minutes === 0
      ? COLORS.etaUrgent
      : minutes <= 10
        ? COLORS.etaWarning
        : COLORS.textPrimary;

  return (
    <View style={styles.container}>
      <Text style={[styles.minutes, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.bgSystem,
  },
  minutes: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
