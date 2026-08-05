import { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteStore } from '@/src/stores/routeStore';
import { SearchBar } from '@/src/components/SearchBar';
import { COLORS } from '@/src/utils/constants';

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const routes = useRouteStore((s) => s.routes);
  const loadRouteData = useRouteStore((s) => s.loadRouteData);
  const loaded = useRouteStore((s) => s.loaded);
  const [query, setQuery] = useState('');
  const isEN = i18n.language === 'en';

  useEffect(() => {
    loadRouteData();
  }, []);

  const filteredRoutes = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return routes
      .filter((r) => r.route.toUpperCase().includes(q))
      .slice(0, 20);
  }, [routes, query]);

  const handleRoutePress = (route: string) => {
    router.push(`/eta/${route}`);
  };

  return (
    <View style={styles.container}>
      <SearchBar value={query} onChangeText={setQuery} />
      {!loaded ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('home.loading')}</Text>
        </View>
      ) : filteredRoutes.length === 0 && query.length > 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('search.noResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRoutes}
          keyExtractor={(item) => item.route}
          renderItem={({ item }) => (
            <Pressable
              style={styles.routeItem}
              onPress={() => handleRoutePress(item.route)}
            >
              <Text style={styles.routeNumber}>{item.route}</Text>
              <View style={styles.routeInfo}>
                <Text style={styles.routeDest} numberOfLines={1}>
                  {isEN ? item.dest_en : item.dest_tc}
                </Text>
                <Text style={styles.routeOrigin} numberOfLines={1}>
                  {isEN ? item.orig_en : item.orig_tc}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 17, color: COLORS.textSecondary },
  list: { paddingVertical: 8 },
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
  routeDest: { fontSize: 17, color: COLORS.textPrimary },
  routeOrigin: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
});
