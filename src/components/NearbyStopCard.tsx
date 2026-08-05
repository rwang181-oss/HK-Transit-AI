import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { formatDistance } from '@/src/utils/formatters';
import { useTranslation } from 'react-i18next';

interface NearbyStopCardProps {
  stopName: string;
  distance: number;
  routes: string[];
  onPress: () => void;
}

export function NearbyStopCard({
  stopName,
  distance,
  routes,
  onPress,
}: NearbyStopCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {stopName}
        </Text>
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
        </View>
      </View>
      <Text style={styles.routes} numberOfLines={1}>
        {t('nearby.routes')}: {routes.join(', ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  distanceBadge: {
    backgroundColor: COLORS.hkRed,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  distanceText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  routes: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
