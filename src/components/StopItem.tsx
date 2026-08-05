import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import type { ETA } from '@/src/services/kmbAPI';
import { ETARow } from './ETARow';

interface StopItemProps {
  stopName: string;
  seq: number;
  etas: ETA[];
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

export function StopItem({
  stopName,
  seq,
  etas,
  onPress,
  isFavorite,
  onToggleFavorite,
}: StopItemProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.seqBadge}>
        <Text style={styles.seqText}>{seq}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {stopName}
        </Text>
        <View style={styles.etas}>
          {etas.length === 0 ? (
            <Text style={styles.noETA}>—</Text>
          ) : (
            etas.slice(0, 3).map((eta, i) => (
              <ETARow
                key={`${eta.eta_seq}-${i}`}
                eta={eta}
                isUrgent={i === 0}
              />
            ))
          )}
        </View>
      </View>
      <Pressable onPress={onToggleFavorite} style={styles.favButton}>
        <Text style={[styles.favIcon, isFavorite && styles.favActive]}>
          {isFavorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 12,
  },
  seqBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgSystem,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  seqText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  etas: {
    flexDirection: 'row',
    gap: 6,
  },
  noETA: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  favButton: {
    padding: 8,
  },
  favIcon: {
    fontSize: 22,
    color: COLORS.textSecondary,
  },
  favActive: {
    color: '#FFB800',
  },
});
