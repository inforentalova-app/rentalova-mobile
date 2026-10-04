import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, Plus, MoreVertical } from 'lucide-react-native';
import { db, auth } from '../lib/firebase';

const TEAL = '#4b9c78';

type Product = {
  id: string;
  title: string;
  pricePerDay: number;
  photos: string[];
  status: string;
};

type Tab = 'active' | 'paused' | 'draft';

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: 'Activos' },
  { key: 'paused', label: 'Pausados' },
  { key: 'draft', label: 'Borradores' },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Activo',   bg: '#dcfce7', text: '#15803d' },
  draft:  { label: 'Borrador', bg: '#f3f4f6', text: '#6b7280' },
  paused: { label: 'Pausado',  bg: '#fef9c3', text: '#a16207' },
};

const EMPTY_LABEL: Record<Tab, string> = {
  active: 'No tienes productos activos',
  paused: 'No tienes productos pausados',
  draft:  'No tienes borradores',
};

export default function MyProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rentalCounts, setRentalCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('active');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDocs(
          query(collection(db, 'products'), where('ownerId', '==', user.uid))
        );
        const prods = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        setProducts(prods);
        fetchRentalCounts(prods.map((p) => p.id));
      } catch (e) {
        console.error('Error fetching products:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function fetchRentalCounts(ids: string[]) {
    if (!ids.length) return;
    try {
      const counts: Record<string, number> = {};
      for (let i = 0; i < ids.length; i += 30) {
        const batch = ids.slice(i, i + 30);
        const snap = await getDocs(
          query(collection(db, 'rentals'), where('productId', 'in', batch))
        );
        snap.docs.forEach((d) => {
          const pid = (d.data() as any).productId as string;
          counts[pid] = (counts[pid] ?? 0) + 1;
        });
      }
      setRentalCounts(counts);
    } catch (e) {
      console.error('Error fetching rental counts:', e);
    }
  }

  async function handleToggleStatus(item: Product) {
    const newStatus = item.status === 'active' ? 'paused' : 'active';
    try {
      await updateDoc(doc(db, 'products', item.id), { status: newStatus });
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: newStatus } : p))
      );
    } catch {
      Alert.alert('Error', 'No se pudo actualizar el estado.');
    }
  }

  async function handleDelete(item: Product) {
    try {
      await deleteDoc(doc(db, 'products', item.id));
      setProducts((prev) => prev.filter((p) => p.id !== item.id));
    } catch {
      Alert.alert('Error', 'No se pudo eliminar el producto.');
    }
  }

  function openMenu(item: Product) {
    Alert.alert(item.title, undefined, [
      {
        text: 'Editar',
        onPress: () => router.push(`/product/edit/${item.id}` as any),
      },
      {
        text: item.status === 'paused' ? 'Activar' : 'Pausar',
        onPress: () => handleToggleStatus(item),
      },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Eliminar producto',
            '¿Estás seguro? Esta acción no se puede deshacer.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Eliminar', style: 'destructive', onPress: () => handleDelete(item) },
            ]
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  const filtered = products.filter((p) => {
    if (activeTab === 'active') return p.status === 'active';
    if (activeTab === 'paused') return p.status === 'paused';
    return p.status === 'draft';
  });

  const tabCounts: Record<Tab, number> = {
    active: products.filter((p) => p.status === 'active').length,
    paused: products.filter((p) => p.status === 'paused').length,
    draft:  products.filter((p) => p.status === 'draft').length,
  };

  function renderItem({ item }: { item: Product }) {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft;
    const photo = item.photos?.[0];
    const count = rentalCounts[item.id] ?? 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push(`/product/edit/${item.id}` as any)}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]} />
        )}

        <View style={styles.cardBody}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.price}>
            {item.pricePerDay != null ? `${item.pricePerDay}€/día` : '—'}
          </Text>
          <Text style={styles.rentalCount}>
            {count === 0 ? 'Sin alquileres' : count === 1 ? '1 alquiler' : `${count} alquileres`}
          </Text>
        </View>

        <View style={styles.cardRight}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => openMenu(item)}
            hitSlop={8}
          >
            <MoreVertical size={18} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Mis productos</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {tabCounts[tab.key] > 0 && (
              <View style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}>
                <Text style={[styles.tabPillText, activeTab === tab.key && styles.tabPillTextActive]}>
                  {tabCounts[tab.key]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{EMPTY_LABEL[activeTab]}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/publish')}
        activeOpacity={0.85}
      >
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { padding: 4 },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
    marginLeft: 12,
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  tabActive: { borderBottomColor: TEAL },
  tabLabel: { fontSize: 14, fontWeight: '500', color: '#9ca3af' },
  tabLabelActive: { color: TEAL, fontWeight: '700' },
  tabPill: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabPillActive: { backgroundColor: '#d1fae5' },
  tabPillText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  tabPillTextActive: { color: TEAL },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: '#9ca3af' },

  listContent: { padding: 20, gap: 12, paddingBottom: 100 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  photo: { width: 80, height: 80, backgroundColor: '#f3f4f6' },
  photoPlaceholder: { backgroundColor: '#e5e7eb' },
  cardBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  productTitle: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 19, marginBottom: 3 },
  price: { fontSize: 13, fontWeight: '700', color: TEAL, marginBottom: 3 },
  rentalCount: { fontSize: 11, color: '#9ca3af' },

  cardRight: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingRight: 12,
    gap: 8,
  },
  menuButton: { padding: 2 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  fab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
});
