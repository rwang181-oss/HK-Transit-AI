import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useJourneyStore } from '@/src/stores/journeyStore';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { COLORS } from '@/src/utils/constants';

type Target = 'from' | 'to';

export default function JourneyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isEN = i18n.language === 'en';
  const { status, loadData, searchStops } = useJourneyStore();

  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromHub, setFromHub] = useState<StopHub | null>(null);
  const [toHub, setToHub] = useState<StopHub | null>(null);
  const [activeField, setActiveField] = useState<Target | null>(null);
  const [debouncedFrom, setDebouncedFrom] = useState('');
  const [debouncedTo, setDebouncedTo] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  // Debounce searches so typing doesn't scan 8k hubs every keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedFrom(fromQuery), 250);
    return () => clearTimeout(id);
  }, [fromQuery]);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedTo(toQuery), 250);
    return () => clearTimeout(id);
  }, [toQuery]);

  const results = useMemo(
    () =>
      activeField === 'from'
        ? searchStops(debouncedFrom)
        : activeField === 'to'
          ? searchStops(debouncedTo)
          : [],
    [activeField, debouncedFrom, debouncedTo, searchStops]
  );

  const handlePick = (hub: StopHub) => {
    if (activeField === 'from') {
      setFromHub(hub);
      setFromQuery(isEN ? hub.name_en : hub.name_tc);
    } else if (activeField === 'to') {
      setToHub(hub);
      setToQuery(isEN ? hub.name_en : hub.name_tc);
    }
    setActiveField(null);
  };

  const handleSwap = () => {
    setFromHub(toHub);
    setToHub(fromHub);
    setFromQuery(toHub ? (isEN ? toHub.name_en : toHub.name_tc) : '');
    setToQuery(fromHub ? (isEN ? fromHub.name_en : fromHub.name_tc) : '');
  };

  const handlePlan = () => {
    if (fromHub && toHub) {
      router.push(
        `/journey/result?from=${fromHub.id}&to=${toHub.id}` as any
      );
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t('journey.loading')}</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('home.error')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputCard}>
        {/* From */}
        <Text style={styles.fieldLabel}>{t('journey.from')}</Text>
        <TextInput
          style={[styles.input, activeField === 'from' && styles.inputActive]}
          value={fromQuery}
          onChangeText={(v) => {
            setFromQuery(v);
            setFromHub(null);
            setActiveField('from');
          }}
          onFocus={() => setActiveField('from')}
          placeholder={t('journey.searchPlaceholder')}
          placeholderTextColor={COLORS.textSecondary}
        />

        {/* Swap */}
        <Pressable style={styles.swapBtn} onPress={handleSwap}>
          <Text style={styles.swapText}>⇅</Text>
        </Pressable>

        {/* To */}
        <Text style={styles.fieldLabel}>{t('journey.to')}</Text>
        <TextInput
          style={[styles.input, activeField === 'to' && styles.inputActive]}
          value={toQuery}
          onChangeText={(v) => {
            setToQuery(v);
            setToHub(null);
            setActiveField('to');
          }}
          onFocus={() => setActiveField('to')}
          placeholder={t('journey.searchPlaceholder')}
          placeholderTextColor={COLORS.textSecondary}
        />

        <Pressable
          style={[
            styles.planBtn,
            !(fromHub && toHub) && styles.planBtnDisabled,
          ]}
          onPress={handlePlan}
          disabled={!(fromHub && toHub)}
        >
          <Text style={styles.planBtnText}>{t('journey.plan')}</Text>
        </Pressable>
      </View>

      {/* Search suggestions */}
      {activeField && (
        <ScrollView
          style={styles.results}
          keyboardShouldPersistTaps="handled"
        >
          {results.length === 0 ? (
            <Text style={styles.noResultHint}>
              {t('journey.noResult')}
            </Text>
          ) : (
            results.map((hub) => (
              <Pressable
                key={hub.id}
                style={styles.resultItem}
                onPress={() => handlePick(hub)}
              >
                <Text style={styles.resultName}>
                  {isEN ? hub.name_en : hub.name_tc}
                </Text>
                <Text style={styles.resultMeta}>
                  {hub.members
                    .map((m) => t(`providers.${m.provider}`))
                    .join(' · ')}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {status === 'ready' && (
        <Text style={styles.estimateNote}>{t('journey.estimates')}</Text>
      )}
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
    backgroundColor: COLORS.bgSystem,
  },
  loadingText: { fontSize: 17, color: COLORS.textSecondary },
  errorText: { fontSize: 17, color: COLORS.hkRed },
  inputCard: {
    backgroundColor: COLORS.bgCard,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.textPrimary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputActive: {
    borderColor: COLORS.hkRed,
  },
  swapBtn: {
    alignSelf: 'center',
    padding: 8,
    marginVertical: 6,
  },
  swapText: { fontSize: 22, color: COLORS.hkRed },
  planBtn: {
    backgroundColor: COLORS.hkRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  planBtnDisabled: {
    opacity: 0.4,
  },
  planBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  results: {
    flex: 1,
    marginHorizontal: 16,
  },
  resultItem: {
    backgroundColor: COLORS.bgCard,
    padding: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  resultName: { fontSize: 16, color: COLORS.textPrimary },
  resultMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  noResultHint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 16,
  },
  estimateNote: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
});
