import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/src/utils/constants';
import { ETARow } from './ETARow';
import type { ETA } from '@/src/services/kmbAPI';
import type { FavoriteRoute } from '@/src/stores/favoriteStore';

interface RouteCardProps {
  favorite: FavoriteRoute;
  etas: ETA[];
  onPress: () => void;
}

export function RouteCard({ favorite, etas, onPress }: RouteCardProps) {
  const { i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const dest = isEN ? favorite.dest_en : favorite.dest_tc;
  const stopName = isEN ? favorite.stopNameEn : favorite.stopNameTc;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.routeNumber}>{favorite.route}</Text>
        <Text style={styles.dest} numberOfLines={1}>
          {dest}
        </Text>
      </View>
      <Text style={styles.stopName} numberOfLines={1}>
        {stopName}
      </Text>
      <View style={styles.etas}>
        {etas.length === 0 ? (
          <Text style={styles.noETA}>—</Text>
        ) : (
          etas.slice(0, 2).map((eta, i) => (
            <ETARow
              key={`${eta.eta_seq}-${i}`}
              eta={eta}
              isUrgent={i === 0}
            />
          ))
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  routeNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.hkRed,
    marginRight: 12,
  },
  dest: {
    fontSize: 17,
    color: COLORS.textPrimary,
    flex: 1,
  },
  stopName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  etas: {
    flexDirection: 'row',
    gap: 8,
  },
  noETA: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
});
