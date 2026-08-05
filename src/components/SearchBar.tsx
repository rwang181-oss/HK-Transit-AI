import { View, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function SearchBar({ value, onChangeText }: SearchBarProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('search.placeholder')}
        placeholderTextColor={COLORS.textSecondary}
        autoFocus
        keyboardType="number-pad"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.bgSystem,
  },
  input: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
});
