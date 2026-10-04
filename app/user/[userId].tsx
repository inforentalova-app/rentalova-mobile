import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ChevronLeft, Star, Calendar, MessageCircle, MapPin, Heart } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';

const TEAL = '#4b9c78';
const CARD_GAP = 12;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 20 * 2 - CARD_GAP) / 2;

type UserProfile = {
  displayName: string;
  photoURL?: string | null;
  createdAt: any;
  rating?: number | null;
  reviewCount?: number | null;
};

type Product = {
  id: string;
  title: string;
  category?: string;
  location?: string;
  pricePerDay: number;
  photos: string[];
};

type Review = {
  id: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerPhoto?: string;
  rating: number;
  comment?: string;
  createdAt: any;
};

function formatMemberDate(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function formatReviewDate(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 30) return `Hace ${diffDays} días`;
  return d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color="#f59e0b"
          fill={n <= Math.round(rating) ? '#f59e0b' : 'transparent'}
          strokeWidth={1.5}
        />
      ))}
    </View>
  );
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    getDoc(doc(db, 'favorites', currentUser.uid))
      .then((snap) => {
        const ids: string[] = snap.exists() ? (snap.data().productIds ?? []) : [];
        setFavoriteIds(new Set(ids));
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!userId) return;
    async function load() {
      try {
        const [userSnap, productsSnap, reviewsSnap] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDocs(query(
            collection(db, 'products'),
            where('ownerId', '==', userId),
            where('status', '==', 'active'),
          )),
          getDocs(query(
            collection(db, 'reviews'),
            where('reviewedId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(20),
          )),
        ]);

        const productDocs = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        const userData = userSnap.data();
        const fallbackName = productDocs[0]
          ? (productsSnap.docs[0].data().ownerName ?? 'Usuario')
          : 'Usuario';

        setProfile({
          displayName: userData?.displayName ?? fallbackName,
          photoURL: userData?.photoURL ?? null,
          createdAt: userData?.createdAt ?? null,
          rating: userData?.rating ?? null,
          reviewCount: userData?.reviewCount ?? null,
        });
        setProducts(productDocs);
        setReviews(reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Review)));
      } catch (e) {
        console.error('Error loading user profile:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  const toggleFavorite = useCallback(async (item: Product) => {
    if (!currentUser) return;
    const ref = doc(db, 'favorites', currentUser.uid);
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
  }, [currentUser, favoriteIds]);

  async function handleSendMessage() {
    if (!currentUser) { router.push('/(auth)/login'); return; }
    if (currentUser.uid === userId) return;
    setSending(true);
    try {
      // Find existing conversation between these two users (not tied to a product)
      const snap = await getDocs(query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', currentUser.uid),
      ));
      const existing = snap.docs.find((d) => {
        const p: string[] = d.data().participants ?? [];
        return p.includes(userId);
      });
      if (existing) {
        router.push(`/chat/${existing.id}`);
        return;
      }
      // Create new conversation
      const now = Timestamp.now();
      const convRef = await addDoc(collection(db, 'conversations'), {
        participants: [currentUser.uid, userId],
        participantNames: {
          [currentUser.uid]: currentUser.displayName ?? 'Usuario',
          [userId]: profile?.displayName ?? 'Usuario',
        },
        participantPhotos: {
          [currentUser.uid]: currentUser.photoURL ?? '',
          [userId]: profile?.photoURL ?? '',
        },
        productId: null,
        productTitle: null,
        productPhoto: null,
        lastMessage: null,
        lastMessageAt: now,
        lastMessageSenderId: null,
        unreadCount: { [currentUser.uid]: 0, [userId]: 0 },
        createdAt: now,
      });
      router.push(`/chat/${convRef.id}`);
    } catch (e) {
      console.error('Error creating conversation:', e);
      Alert.alert('Error', 'No se pudo iniciar la conversación.');
    } finally {
      setSending(false);
    }
  }

  function renderProduct({ item }: { item: Product }) {
    const photo = item.photos?.[0];
    const isFav = favoriteIds.has(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/product/${item.id}`)}
      >
        <View style={styles.imageContainer}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cardImage, styles.imagePlaceholder]} />
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
              size={16}
              color={isFav ? '#ef4444' : '#fff'}
              fill={isFav ? '#ef4444' : 'transparent'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.location ? (
            <View style={styles.locationRow}>
              <MapPin size={11} color="#9ca3af" strokeWidth={2} />
              <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
            </View>
          ) : null}
          <Text style={styles.cardPrice}>
            {item.pricePerDay != null ? `${item.pricePerDay}€/día` : '—'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  const name = profile?.displayName ?? 'Usuario';
  const isSelf = currentUser?.uid === userId;

  const ProfileHeader = (
    <View style={styles.profileSection}>
      {/* Avatar */}
      {profile?.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={styles.avatarImage} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
      )}

      {/* Name */}
      <Text style={styles.userName}>{name}</Text>

      {/* Member since */}
      {profile?.createdAt ? (
        <View style={styles.memberRow}>
          <Calendar size={13} color="#9ca3af" strokeWidth={2} />
          <Text style={styles.memberText}>Miembro desde {formatMemberDate(profile.createdAt)}</Text>
        </View>
      ) : null}

      {/* Rating */}
      {profile?.rating != null ? (
        <View style={styles.ratingRow}>
          <Stars rating={profile.rating} size={16} />
          <Text style={styles.ratingValue}>{profile.rating.toFixed(1)}</Text>
          {profile.reviewCount ? (
            <Text style={styles.ratingCount}>({profile.reviewCount} reseñas)</Text>
          ) : null}
        </View>
      ) : null}

      {/* Send message button */}
      {!isSelf && (
        <TouchableOpacity
          style={[styles.messageBtn, sending && styles.messageBtnDisabled]}
          onPress={handleSendMessage}
          disabled={sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <MessageCircle size={17} color="#fff" strokeWidth={2} />
                <Text style={styles.messageBtnText}>Enviar mensaje</Text>
              </>
          }
        </TouchableOpacity>
      )}

      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>
        Productos disponibles{products.length > 0 ? ` · ${products.length}` : ''}
      </Text>
    </View>
  );

  const ReviewsFooter = reviews.length > 0 ? (
    <View style={styles.reviewsSection}>
      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>Valoraciones · {reviews.length}</Text>
      {reviews.map((r) => (
        <View key={r.id} style={styles.reviewCard}>
          <View style={styles.reviewTop}>
            {r.reviewerPhoto ? (
              <Image source={{ uri: r.reviewerPhoto }} style={styles.reviewerAvatar} />
            ) : (
              <View style={styles.reviewerAvatarPlaceholder}>
                <Text style={styles.reviewerAvatarInitial}>
                  {(r.reviewerName?.[0] ?? '?').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.reviewMeta}>
              <Text style={styles.reviewerName}>{r.reviewerName ?? 'Usuario'}</Text>
              <View style={styles.reviewMetaBottom}>
                <Stars rating={r.rating} size={12} />
                <Text style={styles.reviewDate}>{formatReviewDate(r.createdAt)}</Text>
              </View>
            </View>
          </View>
          {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
        </View>
      ))}
      <View style={{ height: 32 }} />
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ProfileHeader}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Este usuario no tiene productos activos</Text>
          </View>
        }
        ListFooterComponent={ReviewsFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },

  // Profile section
  profileSection: { paddingHorizontal: 20, paddingTop: 32, alignItems: 'center' },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44, marginBottom: 14 },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '700' },
  userName: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5, marginBottom: 8, textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  memberText: { fontSize: 13, color: '#6b7280' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  ratingValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  ratingCount: { fontSize: 13, color: '#6b7280' },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: TEAL, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  messageBtnDisabled: { opacity: 0.6 },
  messageBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  divider: { height: 1, backgroundColor: '#f3f4f6', width: '100%', marginBottom: 18 },
  sectionLabel: {
    alignSelf: 'flex-start',
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },

  // Product grid
  listContent: { paddingHorizontal: 20, paddingBottom: 16 },
  columnWrapper: { gap: CARD_GAP, marginBottom: CARD_GAP },
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
  cardImage: { width: '100%', height: 120, backgroundColor: '#f3f4f6' },
  imagePlaceholder: { backgroundColor: '#e5e7eb' },
  badge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: TEAL, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  heartButton: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 20, padding: 5,
  },
  cardBody: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 4, lineHeight: 18 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  locationText: { fontSize: 11, color: '#9ca3af', flex: 1 },
  cardPrice: { fontSize: 13, fontWeight: '700', color: TEAL },
  emptyWrap: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  // Reviews
  reviewsSection: { paddingHorizontal: 20 },
  reviewCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 14,
    marginBottom: 10,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  reviewerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb', flexShrink: 0 },
  reviewerAvatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  reviewerAvatarInitial: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  reviewMeta: { flex: 1 },
  reviewerName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  reviewMetaBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewDate: { fontSize: 12, color: '#9ca3af' },
  reviewComment: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
