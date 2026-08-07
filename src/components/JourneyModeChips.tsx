import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { JourneyMode, WeatherSnapshot } from '@/src/journey/model/types';
import { smartModeForWeather } from '@/src/journey/comfort/comfortEngine';
import { COLORS } from '@/src/utils/constants';

const MODES: JourneyMode[] = ['recommended', 'fastest', 'shade', 'rain', 'indoor'];

interface JourneyModeChipsProps {
  value: JourneyMode;
  onChange: (mode: JourneyMode) => void;
  weather?: WeatherSnapshot;
}

export function JourneyModeChips({ value, onChange, weather }: JourneyModeChipsProps) {
  const { t } = useTranslation();
  const suggested = weather ? smartModeForWeather(weather) : 'recommended';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {MODES.map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(mode)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {t(`journey.modes.${mode}`)}
            </Text>
            {suggested === mode ? <Text style={styles.suggested}>•</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 8, gap: 7 },
  chip: {
    minHeight: 37,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipActive: { borderColor: COLORS.jade, backgroundColor: '#E7F6F3' },
  label: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  labelActive: { color: COLORS.jade, fontWeight: '700' },
  suggested: { color: COLORS.jade, fontSize: 15, lineHeight: 15 },
});
