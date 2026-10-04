import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, Package } from 'lucide-react-native';
import { db, auth, storage } from '../lib/firebase';

const TEAL = '#4b9c78';

type Rental = {
  id: string;
  rentalId?: string;
  productId: string;
  productTitle: string;
  ownerName?: string | null;
  startDate: any;
  endDate: any;
  totalPrice: number | null;
  status: string;
  returnPhotos?: string[];
  deliveryPhotos?: string[];
  disputeId?: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:                    { label: 'Pendiente de aprobación',              bg: '#fef9c3', text: '#a16207' },
  payment_pending:            { label: 'Pago pendiente',                       bg: '#fef9c3', text: '#a16207' },
  deposit_pending:            { label: 'Fianza pendiente',                     bg: '#fff7ed', text: '#c2410c' },
  approved:                   { label: 'Aprobado · Pendiente de entrega',      bg: '#dbeafe', text: '#1d4ed8' },
  owner_delivered:            { label: 'Entregado · Pendiente de recepción',   bg: '#ede9fe', text: '#6d28d9' },
  active:                     { label: 'En curso',                             bg: '#dcfce7', text: '#15803d' },
  renter_returning:           { label: 'Devolución en curso',                  bg: '#fff7ed', text: '#c2410c' },
  pending_owner_confirmation: { label: 'Devolución pendiente de confirmación', bg: '#fff7ed', text: '#c2410c' },
  completed:                  { label: 'Completado',                           bg: '#f3f4f6', text: '#6b7280' },
  cancelled:                  { label: 'Cancelado',                            bg: '#fee2e2', text: '#b91c1c' },
  rejected:                   { label: 'Rechazado',                            bg: '#fee2e2', text: '#b91c1c' },
  deposit_failed:             { label: 'Fianza fallida',                       bg: '#fee2e2', text: '#b91c1c' },
  disputed:                   { label: 'En disputa',                           bg: '#fee2e2', text: '#b91c1c' },
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MyRentalsScreen() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentLoadingId, setPaymentLoadingId] = useState<string | null>(null);
  const [depositLoadingId, setDepositLoadingId] = useState<string | null>(null);
  const [confirmLoadingId, setConfirmLoadingId] = useState<string | null>(null);
  const [returnLoadingId, setReturnLoadingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let snapUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (user) => {
      if (snapUnsub) { snapUnsub(); snapUnsub = null; }
      if (!user) { setLoading(false); return; }

      try {
        const reviewsSnap = await getDocs(
          query(collection(db, 'reviews'), where('reviewerId', '==', user.uid)),
        );
        setReviewedIds(new Set(reviewsSnap.docs.map((d) => d.data().rentalId as string)));
      } catch (e) {
        console.error('Error fetching reviews:', e);
      }

      const q = query(collection(db, 'rentals'), where('renterId', '==', user.uid));
      snapUnsub = onSnapshot(
        q,
        (snap) => {
          const sorted = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Rental))
            .sort((a, b) => {
              const ta = (a as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
              const tb = (b as any).createdAt?.toDate?.()?.getTime?.() ?? 0;
              return tb - ta;
            });
          setRentals(sorted);
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching rentals:', err);
          setLoading(false);
        },
      );
    });

    return () => {
      authUnsub();
      if (snapUnsub) snapUnsub();
    };
  }, []);

  async function handlePayNow(item: Rental) {
    const user = auth.currentUser;
    if (!user) return;
    const rid = item.rentalId ?? item.id;
    setPaymentLoadingId(rid);
    try {
      const idToken = await user.getIdToken();
      console.log('[PayNow] rentalId:', rid, '| token:', idToken.slice(0, 20));
      const res = await fetch('https://www.rentalova.com/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ rentalId: rid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `Error ${res.status}`);
      }
      const { checkoutUrl } = await res.json();
      if (!checkoutUrl) throw new Error('No se recibió la URL de pago.');
      await Linking.openURL(checkoutUrl);
    } catch (e: any) {
      Alert.alert('Error al pagar', e.message ?? 'No se pudo iniciar el proceso de pago.');
    } finally {
      setPaymentLoadingId(null);
    }
  }

  async function handleDepositAuth(item: Rental) {
    const user = auth.currentUser;
    if (!user) return;
    const rid = item.rentalId ?? item.id;
    setDepositLoadingId(rid);
    try {
      const idToken = await user.getIdToken();
      console.log('[DepositAuth] rentalId:', rid, '| token:', idToken.slice(0, 20));
      const res = await fetch('https://www.rentalova.com/api/refresh-deposit-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ rentalId: rid }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).message ?? `Error ${res.status}`);
      }
      const { depositCheckoutUrl } = await res.json();
      if (!depositCheckoutUrl) throw new Error('No se recibió la URL de autorización.');
      await Linking.openURL(depositCheckoutUrl);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo iniciar la autorización de la fianza.');
    } finally {
      setDepositLoadingId(null);
    }
  }

  async function handleConfirmReceipt(rentalId: string) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;
    if (result.assets.length < 3) {
      Alert.alert('Fotos insuficientes', 'Debes subir al menos 3 fotos del estado del producto.');
      return;
    }

    setConfirmLoadingId(rentalId);
    try {
      const urls: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const blob = await (await fetch(result.assets[i].uri)).blob();
        const fileRef = storageRef(storage, `rentals/${rentalId}/reception/${Date.now()}_${i}`);
        await uploadBytes(fileRef, blob);
        urls.push(await getDownloadURL(fileRef));
      }
      await updateDoc(doc(db, 'rentals', rentalId), {
        status: 'active',
        receivedAt: Timestamp.now(),
        receptionPhotos: urls,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo confirmar la recepción.');
    } finally {
      setConfirmLoadingId(null);
    }
  }


  async function handleMarkReturned(item: Rental) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;

    const rid = item.rentalId ?? item.id;
    setReturnLoadingId(item.id);
    try {
      const urls: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const blob = await (await fetch(result.assets[i].uri)).blob();
        const sRef = storageRef(storage, `rentals/${rid}/return/${Date.now()}_${i}`);
        await uploadBytes(sRef, blob);
        urls.push(await getDownloadURL(sRef));
      }
      await updateDoc(doc(db, 'rentals', item.id), {
        returnPhotos: urls,
        status: 'renter_returning',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo marcar como devuelto.');
    } finally {
      setReturnLoadingId(null);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }

  function renderItem({ item }: { item: Rental }) {
    const cfg = STATUS_CONFIG[item.status] ?? { label: item.status, bg: '#f3f4f6', text: '#6b7280' };
    const rid = item.rentalId ?? item.id;
    const canReview = item.status === 'completed' && !reviewedIds.has(item.id);

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push(`/rental-detail/${item.id}` as any)}>
        <View style={styles.cardHeader}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.productTitle}</Text>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.dateLabel}>Inicio</Text>
          <Text style={styles.dateValue}>{formatDate(item.startDate)}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.dateLabel}>Fin</Text>
          <Text style={styles.dateValue}>{formatDate(item.endDate)}</Text>
        </View>
        {item.totalPrice != null && (
          <Text style={styles.price}>{item.totalPrice}€ total</Text>
        )}

        {item.status === 'payment_pending' && (
          <TouchableOpacity
            style={[styles.payBtn, paymentLoadingId === rid && styles.btnDisabled]}
            activeOpacity={0.8}
            onPress={() => handlePayNow(item)}
            disabled={paymentLoadingId === rid}
          >
            {paymentLoadingId === rid
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.payBtnText}>💳 Pagar ahora</Text>
            }
          </TouchableOpacity>
        )}

        {item.status === 'deposit_pending' && (
          <TouchableOpacity
            style={[styles.depositBtn, depositLoadingId === rid && styles.btnDisabled]}
            activeOpacity={0.8}
            onPress={() => handleDepositAuth(item)}
            disabled={depositLoadingId === rid}
          >
            {depositLoadingId === rid
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.depositBtnText}>🔒 Autorizar fianza</Text>
            }
          </TouchableOpacity>
        )}

        {item.status === 'approved' && (
          <View style={styles.waitingInfo}>
            <Text style={styles.waitingText}>
              Esperando que {item.ownerName ?? 'el propietario'} confirme la entrega...
            </Text>
          </View>
        )}

        {item.status === 'owner_delivered' && (
          <View>
            <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              El propietario ha entregado el producto. Sube al menos 3 fotos del estado en que lo has recibido para confirmar.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#4b9c78', borderRadius: 10, padding: 14, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
              disabled={submitting}
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
                if (result.canceled || result.assets.length < 3) {
                  Alert.alert('Fotos requeridas', 'Debes subir al menos 3 fotos del estado del producto al recibirlo.');
                  return;
                }
                setSubmitting(true);
                try {
                  const urls: string[] = [];
                  for (let i = 0; i < result.assets.length; i++) {
                    const asset = result.assets[i];
                    const response = await fetch(asset.uri);
                    const blob = await response.blob();
                    const ref = storageRef(storage, `rentals/${item.rentalId}/reception/${Date.now()}_${i}`);
                    await uploadBytes(ref, blob);
                    urls.push(await getDownloadURL(ref));
                  }
                  await updateDoc(doc(db, 'rentals', item.rentalId), { status: 'active', receptionPhotos: urls, receivedAt: Timestamp.now() });
                } catch (e) {
                  Alert.alert('Error', 'No se pudieron subir las fotos. Inténtalo de nuevo.');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>He recibido el producto</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.status === 'active' && (
          <TouchableOpacity
            style={[styles.returnBtn, returnLoadingId === item.id && styles.btnDisabled]}
            activeOpacity={0.8}
            onPress={() => handleMarkReturned(item)}
            disabled={returnLoadingId === item.id}
          >
            {returnLoadingId === item.id
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.returnBtnText}>Voy a devolver el producto</Text>
            }
          </TouchableOpacity>
        )}

        {item.status === 'renter_returning' && (
          <View style={styles.waitingInfo}>
            <Text style={styles.waitingText}>
              Esperando que {item.ownerName ?? 'el propietario'} confirme la devolución...
            </Text>
          </View>
        )}

        {item.disputeId && (
          <>
            <View style={styles.disputeBadge}>
              <Text style={styles.disputeBadgeText}>🔴 Disputa abierta</Text>
            </View>
            <TouchableOpacity
              style={styles.disputeBtn}
              activeOpacity={0.8}
              onPress={() => router.push(`/dispute/${item.disputeId}`)}
            >
              <Text style={styles.disputeBtnText}>Ver disputa</Text>
            </TouchableOpacity>
          </>
        )}

        {canReview && (
          <TouchableOpacity
            style={styles.reviewBtn}
            activeOpacity={0.8}
            onPress={() => router.push(`/review/${item.id}`)}
          >
            <Text style={styles.reviewBtnText}>⭐ Valorar</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Mis alquileres</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={rentals}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} colors={[TEAL]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 }}>
              <Package size={52} color="#d1d5db" strokeWidth={1.5} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#9ca3af', textAlign: 'center' }}>Aún no has realizado ningún alquiler</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  listContent: { padding: 20, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  productTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827', lineHeight: 20 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dateLabel: { fontSize: 13, color: '#9ca3af' },
  dateValue: { fontSize: 13, color: '#374151', fontWeight: '500' },
  price: { marginTop: 10, fontSize: 15, fontWeight: '700', color: TEAL },
  btnDisabled: { opacity: 0.6 },
  payBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', backgroundColor: '#f59e0b',
  },
  payBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  depositBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', backgroundColor: '#ea580c',
  },
  depositBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  receiptInfo: {
    marginTop: 12, fontSize: 13, color: '#374151', lineHeight: 18, textAlign: 'center',
  },
  confirmBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', backgroundColor: '#1d4ed8',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  returnBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', backgroundColor: TEAL,
  },
  returnBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disputeBadge: {
    marginTop: 12, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: '#fee2e2', alignSelf: 'flex-start',
  },
  disputeBadgeText: { fontSize: 12, fontWeight: '700', color: '#b91c1c' },
  disputeBtn: {
    marginTop: 8, borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#ef4444', backgroundColor: '#fff5f5',
  },
  disputeBtnText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
  waitingInfo: {
    marginTop: 12, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
  },
  waitingText: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 18 },
  reviewBtn: {
    marginTop: 12, borderWidth: 1.5, borderColor: '#f59e0b',
    borderRadius: 10, paddingVertical: 8,
    alignItems: 'center', backgroundColor: '#fffbeb',
  },
  reviewBtnText: { fontSize: 14, fontWeight: '700', color: '#b45309' },
});
