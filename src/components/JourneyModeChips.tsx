import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { JourneyPolicy } from '@/src/journey/model/types';
import { COLORS } from '@/src/utils/constants';

const POLICIES: JourneyPolicy[] = [
  'recommended',
  'direct',
  'oneTransfer',
  'fastest',
  'lessWalking',
];

interface JourneyModeChipsProps {
  value: JourneyPolicy;
  onChange: (policy: JourneyPolicy) => void;
}

const LABELS: Record<JourneyPolicy, { en: string; zh: string }> = {
  recommended: { en: 'Comprehensive', zh: '綜合推薦' },
  direct: { en: 'Direct first', zh: '直達優先' },
  oneTransfer: { en: 'At most 1 transfer', zh: '最多一次換乘' },
  fastest: { en: 'Fastest', zh: '最快' },
  lessWalking: { en: 'Less walking', zh: '少步行' },
};

export function JourneyModeChips({ value, onChange }: JourneyModeChipsProps) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'zh';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {POLICIES.map((policy) => {
        const active = value === policy;
        return (
          <Pressable
            key={policy}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(policy)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {LABELS[policy][language]}
            </Text>
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
  },
  chipActive: { borderColor: COLORS.jade, backgroundColor: '#E7F6F3' },
  label: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  labelActive: { color: COLORS.jade, fontWeight: '700' },
});
