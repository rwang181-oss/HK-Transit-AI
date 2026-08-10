import { useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteCatalogStore } from '@/src/stores/routeCatalogStore';
import { SearchBar } from '@/src/components/SearchBar';
import { searchRouteCatalog, type RouteCatalogEntry } from '@/src/journey/search/routeCatalog';
import { COLORS } from '@/src/utils/constants';

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const entries = useRouteCatalogStore((s) => s.entries);
  const errors = useRouteCatalogStore((s) => s.errors);
  const load = useRouteCatalogStore((s) => s.load);
  const loaded = useRouteCatalogStore((s) => s.loaded);
  const query = useRouteCatalogStore((s) => s.query);
  const setQuery = useRouteCatalogStore((s) => s.setQuery);
  const isEN = i18n.language === 'en';

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRoutes = useMemo(() => {
    return searchRouteCatalog(entries, query);
  }, [entries, query]);

  const handleRoutePress = (item: RouteCatalogEntry) => {
    const params = new URLSearchParams({
      provider: item.provider,
      route: item.route,
      bound: item.bound,
    });
    router.push(`/route-detail?${params.toString()}` as never);
  };

  return (
    <View style={styles.container}>
      <SearchBar value={query} onChangeText={setQuery} />
      {loaded && Object.keys(errors).length > 0 && (
        <Text style={styles.partialWarning}>{t('search.partialData')}</Text>
      )}
      {!loaded ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('home.loading')}</Text>
        </View>
      ) : filteredRoutes.length === 0 && query.length > 0 ? (
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
                key={item.key}
                style={styles.routeItem}
                onPress={() => handleRoutePress(item)}
              >
                <View style={styles.routeCode}>
                  <Text style={styles.routeNumber}>{item.publicRoute}</Text>
                  <Text style={styles.providerBadge}>{t(`providers.${item.provider}`)}</Text>
                </View>
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
  routeCode: { width: 84, alignItems: 'flex-start' },
  routeNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.hkRed,
  },
  providerBadge: {
    marginTop: 3,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
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
  partialWarning: {
    marginHorizontal: 16,
    marginBottom: 6,
    color: COLORS.textSecondary,
    fontSize: 13,
  },
});
