import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Modal,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  Keyboard,
  Animated,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { router } from 'expo-router';
import {
  Search, MapPin, Heart, SlidersHorizontal, X,
  Clock, Camera, Cpu, Wrench, Dumbbell, Tent, Package,
} from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';
const CARD_GAP = 12;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - 28 * 2 - CARD_GAP) / 2;
const MAX_PRICE = 300;
const RECENT_KEY = 'recent_searches';

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
  'Centro', 'Arganzuela', 'Retiro', 'Salamanca', 'Chamartín',
  'Tetuán', 'Chamberí', 'Fuencarral', 'Moncloa', 'Latina',
  'Carabanchel', 'Usera', 'Puente de Vallecas', 'Moratalaz',
  'Ciudad Lineal', 'Hortaleza', 'Villaverde', 'Villa de Vallecas',
  'Vicálvaro', 'San Blas', 'Barajas', 'Alcobendas', 'Getafe',
  'Leganés', 'Móstoles', 'Alcorcón', 'Pozuelo',
];

const POPULAR_CATEGORIES = [
  { label: 'Fotografía y vídeo', display: 'Fotografía', Icon: Camera },
  { label: 'Electrónica',        display: 'Electrónica', Icon: Cpu },
  { label: 'Herramientas',       display: 'Herramientas', Icon: Wrench },
  { label: 'Deporte',            display: 'Deporte',      Icon: Dumbbell },
  { label: 'Camping',            display: 'Camping',      Icon: Tent },
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

export default function SearchScreen() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [user, setUser]                 = useState<User | null>(null);
  const [favoriteIds, setFavoriteIds]   = useState<Set<string>>(new Set());

  const [searchText, setSearchText]         = useState('');
  const [inputFocused, setInputFocused]     = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedZone, setSelectedZone]         = useState('Todas las zonas');
  const [maxPrice, setMaxPrice]                 = useState(MAX_PRICE);
  const [minPrice, setMinPrice]                 = useState(0);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [zoneModalVisible, setZoneModalVisible]         = useState(false);
  const [priceModalVisible, setPriceModalVisible]       = useState(false);

  const [pendingMinPrice, setPendingMinPrice]         = useState(0);
  const [pendingMaxPrice, setPendingMaxPrice]         = useState(MAX_PRICE);
  const [pendingMinPriceText, setPendingMinPriceText] = useState('');
  const [pendingMaxPriceText, setPendingMaxPriceText] = useState('');

  const { colors } = useTheme();

  // Load recent searches
  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((val) => {
      if (val) setRecentSearches(JSON.parse(val));
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'favorites', user.uid))
      .then((snap) => {
        const ids: string[] = snap.exists() ? (snap.data().productIds ?? []) : [];
        setFavoriteIds(new Set(ids));
      })
      .catch(() => {});
  }, [user]);

  const fetchProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'active')));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    } catch (e) {
      console.error('Error fetching products:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function saveSearch(text: string) {
    if (!text.trim()) return;
    const trimmed = text.trim();
    const next = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, 5);
    setRecentSearches(next);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function handleSelectSuggestion(title: string) {
    setSearchText(title);
    saveSearch(title);
    setInputFocused(false);
    Keyboard.dismiss();
  }

  function handleSelectRecentSearch(text: string) {
    setSearchText(text);
    saveSearch(text);
    setInputFocused(false);
    Keyboard.dismiss();
  }

  function handleSelectPopularCategory(categoryLabel: string) {
    setSelectedCategory(categoryLabel);
    setInputFocused(false);
    Keyboard.dismiss();
  }

  function clearSearch() {
    setSearchText('');
  }

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
  }, [products, searchText, selectedCategory, selectedZone, maxPrice, minPrice]);

  const suggestions = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    if (!text) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of products) {
      if (p.title?.toLowerCase().includes(text) && !seen.has(p.title)) {
        seen.add(p.title);
        result.push(p.title);
        if (result.length === 5) break;
      }
    }
    return result;
  }, [products, searchText]);

  const hasActiveFilters =
    selectedCategory !== 'Todas' ||
    selectedZone !== 'Todas las zonas' ||
    maxPrice < MAX_PRICE ||
    minPrice > 0;

  function clearFilters() {
    setSelectedCategory('Todas');
    setSelectedZone('Todas las zonas');
    setMaxPrice(MAX_PRICE);
    setPendingMaxPrice(MAX_PRICE);
    setMinPrice(0);
    setPendingMinPrice(0);
    setPendingMinPriceText('');
    setPendingMaxPriceText('');
  }

  const toggleFavorite = useCallback(async (item: Product) => {
    if (!user) return;
    const ref = doc(db, 'favorites', user.uid);
    const isFav = favoriteIds.has(item.id);
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
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(item.id) : next.delete(item.id);
        return next;
      });
    }
  }, [user, favoriteIds]);

  const priceLabel =
    minPrice > 0 && maxPrice < MAX_PRICE ? `${minPrice}€ – ${maxPrice}€/día`
    : minPrice > 0 ? `Desde ${minPrice}€/día`
    : maxPrice < MAX_PRICE ? `Hasta ${maxPrice}€/día`
    : 'Precio';
  const priceActive = maxPrice < MAX_PRICE || minPrice > 0;

  function renderCard({ item }: { item: Product }) {
    const photo = item.photos?.[0];
    const isFav = favoriteIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
        activeOpacity={0.85}
        onPress={() => router.push(`/product/${item.id}`)}
      >
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
          <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite(item)} hitSlop={8}>
            <Heart size={18} color={isFav ? '#ef4444' : '#fff'} fill={isFav ? '#ef4444' : 'transparent'} strokeWidth={2} />
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

  const showDiscovery = inputFocused && !searchText.trim();
  const showSuggestions = inputFocused && searchText.trim().length > 0 && suggestions.length > 0;

  const FiltersHeader = (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }, selectedCategory !== 'Todas' && styles.filterChipActive]}
          onPress={() => setCategoryModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterChipText, { color: colors.textLight }, selectedCategory !== 'Todas' && styles.filterChipTextActive]}>
            {selectedCategory === 'Todas' ? 'Categoría' : selectedCategory}
          </Text>
          <Text style={[styles.filterChevron, { color: colors.textLight }, selectedCategory !== 'Todas' && styles.filterChipTextActive]}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }, selectedZone !== 'Todas las zonas' && styles.filterChipActive]}
          onPress={() => setZoneModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterChipText, { color: colors.textLight }, selectedZone !== 'Todas las zonas' && styles.filterChipTextActive]}>
            {selectedZone === 'Todas las zonas' ? 'Zona' : selectedZone}
          </Text>
          <Text style={[styles.filterChevron, { color: colors.textLight }, selectedZone !== 'Todas las zonas' && styles.filterChipTextActive]}>▾</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.card, borderColor: colors.border }, priceActive && styles.filterChipActive]}
          onPress={() => {
            setPendingMinPrice(minPrice);
            setPendingMaxPrice(maxPrice);
            setPendingMinPriceText(minPrice === 0 ? '' : minPrice.toString());
            setPendingMaxPriceText(maxPrice >= MAX_PRICE ? '' : maxPrice.toString());
            setPriceModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <SlidersHorizontal size={13} color={priceActive ? TEAL : '#6b7280'} strokeWidth={2} />
          <Text style={[styles.filterChipText, { color: colors.textLight, marginLeft: 5 }, priceActive && styles.filterChipTextActive]}>
            {priceLabel}
          </Text>
        </TouchableOpacity>

        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearChip} onPress={clearFilters} activeOpacity={0.7}>
            <X size={13} color="#ef4444" strokeWidth={2.5} />
            <Text style={styles.clearChipText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {!loading && (
        <Text style={[styles.resultsCount, { color: colors.textLight }]}>
          {filtered.length} {filtered.length === 1 ? 'producto' : 'productos'} en Madrid
        </Text>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Buscar</Text>
      </View>

      {/* Search bar — always visible, outside FlatList */}
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Search size={16} color="#9ca3af" strokeWidth={2} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Buscar productos..."
          placeholderTextColor="#9ca3af"
          value={searchText}
          onChangeText={setSearchText}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setTimeout(() => setInputFocused(false), 150)}
          onSubmitEditing={() => { if (searchText.trim()) saveSearch(searchText.trim()); }}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={clearSearch} hitSlop={8} style={styles.clearBtn}>
            <X size={15} color="#9ca3af" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions dropdown — absolute, overlays content below */}
      {showSuggestions && (
        <View style={[styles.suggestionsPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {suggestions.map((title) => (
            <TouchableOpacity
              key={title}
              style={[styles.suggestionRow, { borderBottomColor: colors.border }]}
              onPress={() => handleSelectSuggestion(title)}
              activeOpacity={0.7}
            >
              <Search size={14} color="#9ca3af" strokeWidth={2} />
              <Text style={[styles.suggestionText, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Discovery panel — recents + popular categories */}
      {showDiscovery ? (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.discoveryContent}
        >
          {recentSearches.length > 0 && (
            <View style={[styles.discoverySection, { backgroundColor: colors.background }]}>
              <Text style={[styles.discoverySectionTitle, { color: colors.textLight }]}>BÚSQUEDAS RECIENTES</Text>
              {recentSearches.map((text) => (
                <TouchableOpacity
                  key={text}
                  style={[styles.recentRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleSelectRecentSearch(text)}
                  activeOpacity={0.7}
                >
                  <Clock size={15} color="#9ca3af" strokeWidth={2} />
                  <Text style={[styles.recentText, { color: colors.text }]}>{text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={[styles.discoverySection, { backgroundColor: colors.background }]}>
            <Text style={[styles.discoverySectionTitle, { color: colors.textLight }]}>CATEGORÍAS POPULARES</Text>
            <View style={styles.popularGrid}>
              {POPULAR_CATEGORIES.map(({ label, display, Icon }) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.popularCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleSelectPopularCategory(label)}
                  activeOpacity={0.75}
                >
                  <View style={styles.popularIconWrap}>
                    <Icon size={24} color={TEAL} strokeWidth={1.5} />
                  </View>
                  <Text style={[styles.popularLabel, { color: colors.text }]}>{display}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : (
        loading ? (
          <FlatList
            data={[0,1,2,3,4,5]}
            keyExtractor={(i) => String(i)}
            renderItem={() => <SkeletonCard colors={colors} width={CARD_WIDTH} />}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={FiltersHeader}
            scrollEnabled={false}
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={FiltersHeader}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchProducts(true)} tintColor={TEAL} colors={[TEAL]} />}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 }}>
                <Package size={52} color={colors.border} strokeWidth={1.5} />
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textLight, textAlign: 'center' }}>No se encontraron productos</Text>
              </View>
            }
          />
        )
      )}

      {/* Category modal */}
      <Modal visible={categoryModalVisible} transparent animationType="fade" onRequestClose={() => setCategoryModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setCategoryModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Categoría</Text>
                <FlatList
                  data={CATEGORIES}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => {
                    const active = item === selectedCategory;
                    return (
                      <TouchableOpacity
                        style={[styles.modalOption, active && styles.modalOptionActive]}
                        onPress={() => { setSelectedCategory(item); setCategoryModalVisible(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.modalOptionText, { color: colors.text }, active && styles.modalOptionTextActive]}>
                          {item === 'Todas' ? 'Todas las categorías' : item}
                        </Text>
                        {active && <Text style={styles.modalOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Zone modal */}
      <Modal visible={zoneModalVisible} transparent animationType="fade" onRequestClose={() => setZoneModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setZoneModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Zona</Text>
                <FlatList
                  data={ZONES}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => {
                    const active = item === selectedZone;
                    return (
                      <TouchableOpacity
                        style={[styles.modalOption, active && styles.modalOptionActive]}
                        onPress={() => { setSelectedZone(item); setZoneModalVisible(false); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.modalOptionText, { color: colors.text }, active && styles.modalOptionTextActive]}>{item}</Text>
                        {active && <Text style={styles.modalOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Price modal */}
      <Modal visible={priceModalVisible} transparent animationType="fade" onRequestClose={() => setPriceModalVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setPriceModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, styles.priceModalSheet, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Precio por día</Text>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.priceRangeLabel}>Precio mínimo</Text>
                  <View style={styles.priceInputRow}>
                    <TextInput
                      style={styles.priceInput}
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
                    <Text style={styles.priceInputSuffix}>€/día</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0} maximumValue={MAX_PRICE} step={5}
                    value={pendingMinPrice}
                    onValueChange={(val) => {
                      const clamped = Math.min(val, pendingMaxPrice);
                      setPendingMinPrice(clamped);
                      setPendingMinPriceText(clamped === 0 ? '' : clamped.toString());
                    }}
                    minimumTrackTintColor={TEAL} maximumTrackTintColor="#e5e7eb" thumbTintColor={TEAL}
                  />
                  <View style={styles.sliderRangeRow}>
                    <Text style={styles.sliderRangeText}>0€</Text>
                    <Text style={styles.sliderRangeText}>{MAX_PRICE}€</Text>
                  </View>

                  <Text style={[styles.priceRangeLabel, { marginTop: 20 }]}>Precio máximo</Text>
                  <View style={styles.priceInputRow}>
                    <TextInput
                      style={styles.priceInput}
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
                    <Text style={styles.priceInputSuffix}>€/día</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0} maximumValue={MAX_PRICE} step={5}
                    value={pendingMaxPrice}
                    onValueChange={(val) => {
                      const clamped = Math.max(val, pendingMinPrice);
                      setPendingMaxPrice(clamped);
                      setPendingMaxPriceText(clamped >= MAX_PRICE ? '' : clamped.toString());
                    }}
                    minimumTrackTintColor={TEAL} maximumTrackTintColor="#e5e7eb" thumbTintColor={TEAL}
                  />
                  <View style={[styles.sliderRangeRow, { marginBottom: 8 }]}>
                    <Text style={styles.sliderRangeText}>0€</Text>
                    <Text style={styles.sliderRangeText}>{MAX_PRICE}€</Text>
                  </View>
                </ScrollView>
                <View style={styles.priceModalButtons}>
                  <TouchableOpacity style={styles.priceModalCancel} onPress={() => setPriceModalVisible(false)} activeOpacity={0.7}>
                    <Text style={styles.priceModalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.priceModalApply}
                    onPress={() => { setMinPrice(pendingMinPrice); setMaxPrice(pendingMaxPrice); setPriceModalVisible(false); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.priceModalApplyText}>Aplicar</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },

  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 28,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827', height: '100%' },
  clearBtn: { padding: 4, marginLeft: 4 },

  // Suggestions dropdown
  suggestionsPanel: {
    marginHorizontal: 28,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 4,
    zIndex: 50,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  suggestionText: { fontSize: 14, color: '#374151', flex: 1 },

  // Discovery panel
  discoveryContent: { paddingBottom: 40 },
  discoverySection: { paddingHorizontal: 28, paddingTop: 20 },
  discoverySectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  recentText: { fontSize: 14, color: '#374151', flex: 1 },

  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  popularCard: {
    width: (SCREEN_WIDTH - 28 * 2 - 10 * 2) / 3,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingVertical: 16,
    gap: 8,
  },
  popularIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0faf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularLabel: { fontSize: 12, fontWeight: '600', color: '#374151', textAlign: 'center' },

  // Filter chips
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#f0faf5', borderColor: TEAL },
  filterChipText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  filterChipTextActive: { color: TEAL, fontWeight: '600' },
  filterChevron: { fontSize: 11, color: '#9ca3af', marginLeft: 4 },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearChipText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  resultsCount: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    marginHorizontal: 28,
    marginBottom: 12,
  },
  loadingRow: { alignItems: 'center', paddingVertical: 20 },

  // Grid
  listContent: { paddingHorizontal: 28, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: CARD_GAP },
  centered: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  imageContainer: { position: 'relative' },
  image: { width: '100%', height: 120, backgroundColor: '#f3f4f6' },
  imagePlaceholder: { backgroundColor: '#e5e7eb' },
  badge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: TEAL, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  heartButton: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 20, padding: 5,
  },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4, lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  locationText: { fontSize: 11, color: '#9ca3af', flex: 1 },
  price: { fontSize: 13, fontWeight: '700', color: TEAL },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '75%',
  },
  priceModalSheet: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 24, marginBottom: 12 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalOptionActive: { backgroundColor: '#f0faf5' },
  modalOptionText: { fontSize: 15, color: '#374151' },
  modalOptionTextActive: { color: TEAL, fontWeight: '600' },
  modalOptionCheck: { fontSize: 15, color: TEAL, fontWeight: '700' },
  priceRangeLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  priceInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  priceInput: {
    flex: 1, height: 44, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 12, fontSize: 15, color: '#111827',
  },
  priceInputSuffix: { fontSize: 14, color: '#6b7280', fontWeight: '500', width: 44 },
  slider: { width: '100%', height: 40 },
  sliderRangeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  sliderRangeText: { fontSize: 12, color: '#9ca3af' },
  priceModalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  priceModalCancel: {
    flex: 1, height: 48, borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  priceModalCancelText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  priceModalApply: {
    flex: 1, height: 48, borderRadius: 12,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
  },
  priceModalApplyText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
