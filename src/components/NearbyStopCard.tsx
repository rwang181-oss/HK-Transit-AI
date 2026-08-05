import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { formatDistance } from '@/src/utils/formatters';

export interface NearbyRouteAction {
  route: string;
  bound: 'O' | 'I';
  serviceType: number;
  destEn: string;
  destTc: string;
}

interface NearbyStopCardProps {
  stopName: string;
  distance: number;
  routes: NearbyRouteAction[];
  onRoutePress: (r: NearbyRouteAction) => void;
}

export function NearbyStopCard({
  stopName,
  distance,
  routes,
  onRoutePress,
}: NearbyStopCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {stopName}
        </Text>
        <Text style={styles.distance}>{formatDistance(distance)}</Text>
      </View>
      {routes.length === 0 ? (
        <Text style={styles.empty}>—</Text>
      ) : (
        <View style={styles.routes}>
          {routes.map((r) => (
            <Pressable
              key={`${r.route}-${r.bound}`}
              style={styles.routeChip}
              onPress={() => onRoutePress(r)}
            >
              <Text style={styles.routeText}>{r.route}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
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
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  distance: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  routes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routeChip: {
    backgroundColor: COLORS.bgSystem,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  routeText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.hkRed,
  },
  empty: { fontSize: 14, color: COLORS.textSecondary },
});
