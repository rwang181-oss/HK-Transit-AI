import { useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteStore } from '@/src/stores/routeStore';
import { SearchBar } from '@/src/components/SearchBar';
import { COLORS } from '@/src/utils/constants';

interface RouteEntry {
  route: string;
  bound: 'O' | 'I';
  dest_en: string;
  dest_tc: string;
  orig_en: string;
  orig_tc: string;
}

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const routes = useRouteStore((s) => s.routes);
  const loadRouteData = useRouteStore((s) => s.loadRouteData);
  const loaded = useRouteStore((s) => s.loaded);
  const searchQuery = useRouteStore((s) => s.searchQuery);
  const setSearchQuery = useRouteStore((s) => s.setSearchQuery);
  const isEN = i18n.language === 'en';

  useEffect(() => {
    loadRouteData();
  }, []);

  const filteredRoutes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toUpperCase();
    // Group by route+bound so each direction is a separate entry
    const seen = new Set<string>();
    const entries: RouteEntry[] = [];
    for (const r of routes) {
      if (!r.route.toUpperCase().includes(q)) continue;
      const key = `${r.route}_${r.bound || 'O'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        route: r.route,
        bound: r.bound,
        dest_en: r.dest_en,
        dest_tc: r.dest_tc,
        orig_en: r.orig_en,
        orig_tc: r.orig_tc,
      });
    }
    return entries.slice(0, 30);
  }, [routes, searchQuery]);

  const handleRoutePress = (item: RouteEntry) => {
    router.push(
      `/eta/${item.route}?bound=${item.bound}&noToggle=1`
    );
    // Keep query for when user comes back
  };

  return (
    <View style={styles.container}>
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
      {!loaded ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('home.loading')}</Text>
        </View>
      ) : filteredRoutes.length === 0 && searchQuery.length > 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('search.noResults')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {filteredRoutes.map((item, i) => {
            const dest = isEN ? item.dest_en : item.dest_tc;
            const orig = isEN ? item.orig_en : item.orig_tc;
            return (
              <Pressable
                key={`${item.route}-${item.bound}-${i}`}
                style={styles.routeItem}
                onPress={() => handleRoutePress(item)}
              >
                <Text style={styles.routeNumber}>{item.route}</Text>
                <View style={styles.routeInfo}>
                  <View style={styles.destRow}>
                    <View style={styles.boundBadge}>
                      <Text style={styles.boundText}>
                        {isEN ? '→' : '往'}
                      </Text>
                    </View>
                    <Text style={styles.routeDest} numberOfLines={1}>
                      {dest || '—'}
                    </Text>
                  </View>
                  <Text style={styles.routeOrigin} numberOfLines={1}>
                    {orig || '—'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 17, color: COLORS.textSecondary },
  list: { flex: 1, paddingVertical: 8 },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 14,
    borderRadius: 12,
  },
  routeNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.hkRed,
    width: 72,
  },
  routeInfo: { flex: 1 },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boundBadge: {
    marginRight: 6,
  },
  boundText: {
    fontSize: 13,
    color: COLORS.hkRed,
    fontWeight: '600',
  },
  routeDest: { fontSize: 17, color: COLORS.textPrimary, flex: 1 },
  routeOrigin: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
});
