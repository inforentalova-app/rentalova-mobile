import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { MapPin, Heart } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';
const CARD_GAP = 12;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 28 * 2 - CARD_GAP) / 2;

type Product = {
  id: string;
  title: string;
  category: string;
  location: string;
  pricePerDay: number;
  photos: string[];
};

export default function FavoritesScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  const fetchFavorites = useCallback(async (isRefresh = false) => {
    if (!user) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const favSnap = await getDoc(doc(db, 'favorites', user.uid));
      const productIds: string[] = favSnap.exists() ? (favSnap.data().productIds ?? []) : [];
      if (productIds.length === 0) { setFavorites([]); return; }
      const snaps = await Promise.all(productIds.map((id) => getDoc(doc(db, 'products', id))));
      setFavorites(snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() } as Product)));
    } catch (e) {
      console.error('Error fetching favorites:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

  function renderCard({ item }: { item: Product }) {
    const photo = item.photos?.[0];
    return (
      <TouchableOpacity style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]} activeOpacity={0.85}>
        <View style={styles.imageContainer}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          {item.category ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.category}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          {item.location ? (
            <View style={styles.locationRow}>
              <MapPin size={12} color="#9ca3af" strokeWidth={2} />
              <Text style={[styles.locationText, { color: colors.textLight }]} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
          <Text style={styles.price}>
            {item.pricePerDay != null ? `${item.pricePerDay.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/día` : '—'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Favoritos</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchFavorites(true)} tintColor={TEAL} colors={[TEAL]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 }}>
              <Heart size={52} color={colors.border} strokeWidth={1.5} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textLight, textAlign: 'center' }}>Aún no tienes favoritos</Text>
              <Text style={{ fontSize: 14, color: colors.textLight, textAlign: 'center', lineHeight: 20 }}>¡Explora y guarda los que te gusten!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  listContent: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 32,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#f3f4f6',
  },
  imagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: TEAL,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  cardBody: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    lineHeight: 18,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 6,
  },
  locationText: {
    fontSize: 11,
    color: '#9ca3af',
    flex: 1,
  },
  price: {
    fontSize: 13,
    fontWeight: '700',
    color: TEAL,
  },
});
