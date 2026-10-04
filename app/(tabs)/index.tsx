import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Search, MapPin, Heart, Bell, SlidersHorizontal, Package } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';
const CARD_GAP = 12;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 28 * 2 - CARD_GAP) / 2;
const MAX_PRICE = 300;

const CATEGORIES = [
  'Todas',
  'Herramientas',
  'Camping',
  'Electrónica',
  'Deporte',
  'Hogar y jardín',
  'Fotografía y vídeo',
  'Audio y música',
  'Transporte',
  'Bebé y niños',
  'Bricolaje y construcción',
  'Cocina y hostelería',
  'Ropa y moda',
  'Juegos y consolas',
  'Libros y educación',
  'Mascotas',
  'Oficina y papelería',
  'Otros',
];

const ZONES = [
  'Todas las zonas',
  'Centro',
  'Arganzuela',
  'Retiro',
  'Salamanca',
  'Chamartín',
  'Tetuán',
  'Chamberí',
  'Fuencarral',
  'Moncloa',
  'Latina',
  'Carabanchel',
  'Usera',
  'Puente de Vallecas',
  'Moratalaz',
  'Ciudad Lineal',
  'Hortaleza',
  'Villaverde',
  'Villa de Vallecas',
  'Vicálvaro',
  'San Blas',
  'Barajas',
  'Alcobendas',
  'Getafe',
  'Leganés',
  'Móstoles',
  'Alcorcón',
  'Pozuelo',
];

type Product = {
  id: string;
  title: string;
  category: string;
  location: string;
  pricePerDay: number;
  photos: string[];
};

function usePulse() {
  const anim = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ])
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);
  return anim;
}

function SkeletonCard({ colors, width }: { colors: any; width: number }) {
  const opacity = usePulse();
  const bg = colors.border;
  return (
    <Animated.View style={{ width, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity }}>
      <View style={{ width: '100%', height: 120, backgroundColor: bg }} />
      <View style={{ padding: 10, gap: 6 }}>
        <View style={{ height: 12, width: '75%', borderRadius: 6, backgroundColor: bg }} />
        <View style={{ height: 10, width: '50%', borderRadius: 5, backgroundColor: bg }} />
        <View style={{ height: 11, width: '40%', borderRadius: 5, backgroundColor: bg }} />
      </View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [user, setUser] = useState<User | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  const [refreshing, setRefreshing] = useState(false);

  const { colors } = useTheme();

  // Filter modal states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState('Todas las zonas');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  // Pending (inside modal before applying)
  const [pendingCategory, setPendingCategory] = useState('Todas');
  const [pendingZone, setPendingZone] = useState('Todas las zonas');
  const [pendingMinPrice, setPendingMinPrice] = useState(0);
  const [pendingMaxPrice, setPendingMaxPrice] = useState(MAX_PRICE);
  const [pendingMinPriceText, setPendingMinPriceText] = useState('');
  const [pendingMaxPriceText, setPendingMaxPriceText] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
    );
    const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size), () => {});
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    async function loadFavorites() {
      try {
        const snap = await getDoc(doc(db, 'favorites', user!.uid));
        const ids: string[] = snap.exists() ? (snap.data().productIds ?? []) : [];
        setFavoriteIds(new Set(ids));
      } catch (e) {
        console.error('Error loading favorites:', e);
      }
    }
    loadFavorites();
  }, [user]);

  const fetchProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const q = query(collection(db, 'products'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    } catch (e) {
      console.error('Error fetching products:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
      if (selectedZone !== 'Todas las zonas' && !p.location?.includes(selectedZone)) return false;
      if (p.pricePerDay != null && p.pricePerDay < minPrice) return false;
      if (p.pricePerDay != null && p.pricePerDay > maxPrice) return false;
      if (text && !p.title?.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [products, searchText, selectedCategory, selectedZone, minPrice, maxPrice]);

  const activeFiltersCount =
    (selectedCategory !== 'Todas' ? 1 : 0) +
    (selectedZone !== 'Todas las zonas' ? 1 : 0) +
    (minPrice > 0 || maxPrice < MAX_PRICE ? 1 : 0);

  function openFilterModal() {
    setPendingCategory(selectedCategory);
    setPendingZone(selectedZone);
    setPendingMinPrice(minPrice);
    setPendingMaxPrice(maxPrice);
    setPendingMinPriceText(minPrice === 0 ? '' : minPrice.toString());
    setPendingMaxPriceText(maxPrice >= MAX_PRICE ? '' : maxPrice.toString());
    setFilterModalVisible(true);
  }

  function applyFilters() {
    setSelectedCategory(pendingCategory);
    setSelectedZone(pendingZone);
    setMinPrice(pendingMinPrice);
    setMaxPrice(pendingMaxPrice);
    setFilterModalVisible(false);
  }

  function clearPendingFilters() {
    setPendingCategory('Todas');
    setPendingZone('Todas las zonas');
    setPendingMinPrice(0);
    setPendingMaxPrice(MAX_PRICE);
    setPendingMinPriceText('');
    setPendingMaxPriceText('');
  }

  const toggleFavorite = useCallback(async (item: Product) => {
    if (!user) return;
    const ref = doc(db, 'favorites', user.uid);
    const isFav = favoriteIds.has(item.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(item.id) : next.add(item.id);
      return next;
    });
    try {
      if (isFav) {
        await updateDoc(ref, { productIds: arrayRemove(item.id) });
      } else {
        await setDoc(ref, { productIds: arrayUnion(item.id) }, { merge: true });
      }
    } catch (e) {
      console.error('Error toggling favorite:', e);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(item.id) : next.delete(item.id);
        return next;
      });
    }
  }, [user, favoriteIds]);

  function renderCard({ item }: { item: Product }) {
    const photo = item.photos?.[0];
    const isFav = favoriteIds.has(item.id);
    return (
      <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} activeOpacity={0.85} onPress={() => router.push(`/product/${item.id}`)}>
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
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => toggleFavorite(item)}
            hitSlop={8}
          >
            <Heart
              size={18}
              color={isFav ? '#ef4444' : '#fff'}
              fill={isFav ? '#ef4444' : 'transparent'}
              strokeWidth={2}
            />
          </TouchableOpacity>
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
            {item.pricePerDay != null ? `${item.pricePerDay}€/día` : '—'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const ListHeader = (
    <View>
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Search size={16} color="#9ca3af" strokeWidth={2} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Buscar productos..."
          placeholderTextColor="#9ca3af"
          value={searchText}
          onChangeText={setSearchText}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <View style={styles.searchDivider} />
        <TouchableOpacity onPress={openFilterModal} hitSlop={8} style={styles.filterWrap}>
          <SlidersHorizontal size={17} color={activeFiltersCount > 0 ? TEAL : '#9ca3af'} strokeWidth={2} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={styles.logo}>RentaLova</Text>
        <TouchableOpacity onPress={() => router.push('/notifications')} hitSlop={8} style={styles.bellWrap}>
          <Bell size={22} color={TEAL} strokeWidth={2} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <>
          {ListHeader}
          <FlatList
            data={[0,1,2,3,4,5]}
            keyExtractor={(i) => String(i)}
            renderItem={() => <SkeletonCard colors={colors} width={CARD_WIDTH} />}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false}
          />
        </>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchProducts(true)} tintColor={TEAL} colors={[TEAL]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 }}>
              <Package size={52} color={colors.border} strokeWidth={1.5} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textLight, textAlign: 'center' }}>Aún no hay productos disponibles</Text>
            </View>
          }
        />
      )}

      {/* Filter modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFilterModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.filterSheet, { backgroundColor: colors.background }]}>
                {/* Header */}
                <View style={[styles.filterSheetHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.filterSheetTitle, { color: colors.text }]}>Filtros</Text>
                  <TouchableOpacity onPress={() => setFilterModalVisible(false)} hitSlop={8}>
                    <Text style={styles.filterSheetClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Category */}
                  <Text style={[styles.filterSectionLabel, { color: colors.textLight }]}>Categoría</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {CATEGORIES.map((cat) => {
                      const active = cat === pendingCategory;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setPendingCategory(cat)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {cat === 'Todas' ? 'Todas' : cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Zone */}
                  <Text style={[styles.filterSectionLabel, { color: colors.textLight }]}>Zona</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {ZONES.map((zone) => {
                      const active = zone === pendingZone;
                      return (
                        <TouchableOpacity
                          key={zone}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setPendingZone(zone)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {zone === 'Todas las zonas' ? 'Todas' : zone}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Price */}
                  <Text style={[styles.filterSectionLabel, { color: colors.textLight }]}>Precio por día</Text>
                  <View style={styles.filterPriceBlock}>
                    <Text style={styles.filterPriceLabel}>Mínimo</Text>
                    <View style={styles.filterPriceInputRow}>
                      <TextInput
                        style={styles.filterPriceInput}
                        value={pendingMinPriceText}
                        onChangeText={(t) => {
                          setPendingMinPriceText(t);
                          const n = parseInt(t, 10);
                          if (!isNaN(n) && n >= 0 && n <= pendingMaxPrice) setPendingMinPrice(n);
                        }}
                        onBlur={() => {
                          const n = parseInt(pendingMinPriceText, 10);
                          const clamped = isNaN(n) ? 0 : Math.min(Math.max(n, 0), pendingMaxPrice);
                          setPendingMinPrice(clamped);
                          setPendingMinPriceText(clamped === 0 ? '' : clamped.toString());
                        }}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#9ca3af"
                        returnKeyType="done"
                      />
                      <Text style={styles.filterPriceSuffix}>€/día</Text>
                    </View>
                    <Slider
                      style={styles.filterSlider}
                      minimumValue={0}
                      maximumValue={MAX_PRICE}
                      step={5}
                      value={pendingMinPrice}
                      onValueChange={(val) => {
                        const clamped = Math.min(val, pendingMaxPrice);
                        setPendingMinPrice(clamped);
                        setPendingMinPriceText(clamped === 0 ? '' : clamped.toString());
                      }}
                      minimumTrackTintColor={TEAL}
                      maximumTrackTintColor="#e5e7eb"
                      thumbTintColor={TEAL}
                    />

                    <Text style={[styles.filterPriceLabel, { marginTop: 12 }]}>Máximo</Text>
                    <View style={styles.filterPriceInputRow}>
                      <TextInput
                        style={styles.filterPriceInput}
                        value={pendingMaxPriceText}
                        onChangeText={(t) => {
                          setPendingMaxPriceText(t);
                          const n = parseInt(t, 10);
                          if (!isNaN(n) && n >= pendingMinPrice && n <= MAX_PRICE) setPendingMaxPrice(n);
                        }}
                        onBlur={() => {
                          const n = parseInt(pendingMaxPriceText, 10);
                          const clamped = isNaN(n) ? MAX_PRICE : Math.min(Math.max(n, pendingMinPrice), MAX_PRICE);
                          setPendingMaxPrice(clamped);
                          setPendingMaxPriceText(clamped >= MAX_PRICE ? '' : clamped.toString());
                        }}
                        keyboardType="numeric"
                        placeholder="Sin límite"
                        placeholderTextColor="#9ca3af"
                        returnKeyType="done"
                      />
                      <Text style={styles.filterPriceSuffix}>€/día</Text>
                    </View>
                    <Slider
                      style={styles.filterSlider}
                      minimumValue={0}
                      maximumValue={MAX_PRICE}
                      step={5}
                      value={pendingMaxPrice}
                      onValueChange={(val) => {
                        const clamped = Math.max(val, pendingMinPrice);
                        setPendingMaxPrice(clamped);
                        setPendingMaxPriceText(clamped >= MAX_PRICE ? '' : clamped.toString());
                      }}
                      minimumTrackTintColor={TEAL}
                      maximumTrackTintColor="#e5e7eb"
                      thumbTintColor={TEAL}
                    />
                    <View style={styles.filterSliderRange}>
                      <Text style={styles.filterSliderRangeText}>0€</Text>
                      <Text style={styles.filterSliderRangeText}>{MAX_PRICE}€</Text>
                    </View>
                  </View>

                  <View style={{ height: 12 }} />
                </ScrollView>

                {/* Footer buttons */}
                <View style={[styles.filterSheetFooter, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={styles.filterClearBtn} onPress={clearPendingFilters} activeOpacity={0.7}>
                    <Text style={styles.filterClearBtnText}>Limpiar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.filterApplyBtn} onPress={applyFilters} activeOpacity={0.8}>
                    <Text style={styles.filterApplyBtnText}>Aplicar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  logo: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'sans-serif',
    color: TEAL,
    letterSpacing: -1.5,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bellWrap: {
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  filterWrap: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    backgroundColor: TEAL,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 28,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    height: '100%',
  },
  searchDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  // Filter sheet
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 0 : 0,
  },
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  filterSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  filterSheetClose: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
    padding: 4,
  },
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: {
    backgroundColor: '#f0faf5',
    borderColor: TEAL,
  },
  chipText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  chipTextActive: {
    color: TEAL,
    fontWeight: '600',
  },
  filterPriceBlock: {
    paddingHorizontal: 24,
  },
  filterPriceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterPriceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  filterPriceInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
  },
  filterPriceSuffix: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    width: 44,
  },
  filterSlider: {
    width: '100%',
    height: 40,
  },
  filterSliderRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  filterSliderRangeText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  filterSheetFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  filterClearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterClearBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterApplyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#9ca3af',
  },
  listContent: {
    paddingHorizontal: 28,
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
      android: {
        elevation: 3,
      },
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
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 20,
    padding: 5,
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
