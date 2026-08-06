import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { JourneyMode, WeatherSnapshot } from '@/src/journey/model/types';
import { smartModeForWeather } from '@/src/journey/comfort/comfortEngine';
import { COLORS } from '@/src/utils/constants';

const MODES: Array<{ key: JourneyMode; icon: string; color: string }> = [
  { key: 'recommended', icon: '✦', color: COLORS.jade },
  { key: 'fastest', icon: '⚡', color: COLORS.fastest },
  { key: 'shade', icon: '☀', color: COLORS.shade },
  { key: 'rain', icon: '☂', color: COLORS.rain },
  { key: 'indoor', icon: '❄', color: COLORS.indoor },
];

interface JourneyModeChipsProps {
  value: JourneyMode;
  onChange: (mode: JourneyMode) => void;
  weather?: WeatherSnapshot;
}

export function JourneyModeChips({ value, onChange, weather }: JourneyModeChipsProps) {
  const { t } = useTranslation();
  const suggested = weather ? smartModeForWeather(weather) : 'recommended';

  return (
    <View>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('journey.choosePreference')}</Text>
        <Text style={styles.helper}>{t('journey.preferenceHelper')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {MODES.map((mode) => {
          const active = value === mode.key;
          const isSuggested = suggested === mode.key;
          return (
            <Pressable
              key={mode.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(mode.key)}
              style={[
                styles.chip,
                active && { borderColor: mode.color, backgroundColor: `${mode.color}12` },
              ]}
            >
              <Text style={[styles.icon, active && { color: mode.color }]}>{mode.icon}</Text>
              <Text style={[styles.label, active && { color: mode.color }]}>
                {t(`journey.modes.${mode.key}`)}
              </Text>
              {isSuggested ? (
                <View style={[styles.smartDot, { backgroundColor: mode.color }]} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  heading: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  helper: { color: COLORS.textTertiary, fontSize: 11 },
  row: { paddingHorizontal: 16, paddingBottom: 4, gap: 8 },
  chip: {
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700' },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '600' },
  smartDot: { width: 5, height: 5, borderRadius: 3, marginLeft: 1 },
});
