import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft } from 'lucide-react-native';
import { db, auth, storage } from '../lib/firebase';

const TEAL = '#4b9c78';

type Rental = {
  id: string;
  rentalId?: string;
  productTitle: string;
  renterId?: string;
  renterName: string | null;
  ownerName?: string | null;
  startDate: any;
  endDate: any;
  totalPrice: number | null;
  status: string;
  returnPhotos?: string[];
  deliveryPhotos?: string[];
  disputeId?: string;
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function RequestsScreen() {
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deliveryUploadingId, setDeliveryUploadingId] = useState<string | null>(null);
  const [confirmReturnLoadingId, setConfirmReturnLoadingId] = useState<string | null>(null);
  const [disputeLoadingId, setDisputeLoadingId] = useState<string | null>(null);
  // Rejection modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Damage modal
  const [damageTarget, setDamageTarget] = useState<Rental | null>(null);
  const [damageDescription, setDamageDescription] = useState('');

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

      const q = query(collection(db, 'rentals'), where('ownerId', '==', user.uid));
      snapUnsub = onSnapshot(
        q,
        (snap) => {
          const ACTIVE_STATUSES = new Set(['pending', 'approved', 'owner_delivered', 'active', 'renter_returning', 'pending_owner_confirmation', 'completed']);
          const filtered = snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Rental))
            .filter((r) => ACTIVE_STATUSES.has(r.status))
            .sort((a, b) => {
              const ta = a.startDate?.toDate?.()?.getTime?.() ?? 0;
              const tb = b.startDate?.toDate?.()?.getTime?.() ?? 0;
              return tb - ta;
            });
          setRentals(filtered);
          setLoading(false);
        },
        (err) => {
          console.error('Error fetching requests:', err);
          setLoading(false);
        },
      );
    });

    return () => {
      authUnsub();
      if (snapUnsub) snapUnsub();
    };
  }, []);

  async function handleApprove(item: Rental) {
    const rentalId = item.id;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessingId(rentalId);
    try {
      await updateDoc(doc(db, 'rentals', rentalId), { status: 'approved' });
    } catch (e: any) {
      console.error('Error approving rental:', e);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setProcessingId(rejectTarget);
    try {
      await updateDoc(doc(db, 'rentals', rejectTarget), {
        status: 'rejected',
        ...(rejectReason.trim() ? { rejectionReason: rejectReason.trim() } : {}),
      });
    } catch (e: any) {
      console.error('Error rejecting rental:', e);
    } finally {
      setProcessingId(null);
      setRejectTarget(null);
      setRejectReason('');
    }
  }

  async function handleConfirmDelivery(rental: Rental) {
    console.log('[Delivery] abriendo picker');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.7,
    });
    console.log('[Delivery] fotos seleccionadas:', result.assets?.length ?? 0);
    if (result.canceled || !result.assets?.length) return;

    const rid = rental.rentalId ?? rental.id;
    setDeliveryUploadingId(rental.id);
    try {
      const urls: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        console.log('[Delivery] subiendo foto', i);
        const blob = await (await fetch(result.assets[i].uri)).blob();
        const sRef = storageRef(storage, `rentals/${rid}/delivery/${Date.now()}_${i}`);
        await uploadBytes(sRef, blob);
        urls.push(await getDownloadURL(sRef));
      }
      console.log('[Delivery] actualizando status a owner_delivered');
      await updateDoc(doc(db, 'rentals', rental.id), {
        deliveryPhotos: urls,
        status: 'owner_delivered',
        ownerDeliveredAt: new Date(),
      });
    } catch (e: any) {
      console.error('[Delivery] error:', e);
      Alert.alert('Error', e.message ?? 'No se pudo confirmar la entrega.');
    } finally {
      setDeliveryUploadingId(null);
    }
  }

  async function handleConfirmReturn(rentalId: string) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;

    setConfirmReturnLoadingId(rentalId);
    try {
      const urls: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const blob = await (await fetch(result.assets[i].uri)).blob();
        const sRef = storageRef(storage, `rentals/${rentalId}/owner_return/${Date.now()}_${i}`);
        await uploadBytes(sRef, blob);
        urls.push(await getDownloadURL(sRef));
      }
      await updateDoc(doc(db, 'rentals', rentalId), {
        status: 'completed',
        ownerReturnPhotos: urls,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo confirmar la devolución.');
    } finally {
      setConfirmReturnLoadingId(null);
    }
  }

  async function handleReportDamage() {
    if (!damageTarget || !damageDescription.trim()) return;
    setDisputeLoadingId(damageTarget.id);
    try {
      const disputeRef = await addDoc(collection(db, 'disputes'), {
        rentalId: damageTarget.rentalId ?? damageTarget.id,
        rentalDocId: damageTarget.id,
        description: damageDescription.trim(),
        status: 'open',
        ownerId: auth.currentUser?.uid ?? null,
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'rentals', damageTarget.id), {
        status: 'disputed',
        disputeId: disputeRef.id,
      });
      setDamageTarget(null);
      setDamageDescription('');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo crear la disputa.');
    } finally {
      setDisputeLoadingId(null);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }

  function renderItem({ item }: { item: Rental }) {
    const busy = processingId === item.id;
    const canReview = item.status === 'completed' && !reviewedIds.has(item.id);

    return (
      <View style={styles.card}>
        <Text style={styles.productTitle} numberOfLines={2}>{item.productTitle}</Text>
        {item.renterName ? (
          <Text style={styles.renterName}>
            Solicitado por <Text style={styles.renterBold}>{item.renterName}</Text>
          </Text>
        ) : null}
        <View style={styles.datesRow}>
          <Text style={styles.dateText}>{formatDate(item.startDate)}</Text>
          <Text style={styles.dateSep}>→</Text>
          <Text style={styles.dateText}>{formatDate(item.endDate)}</Text>
        </View>
        {item.totalPrice != null && (
          <Text style={styles.price}>{item.totalPrice}€ total</Text>
        )}

        {/* ── PENDING: approve / reject ── */}
        {item.status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn, busy && styles.btnDisabled]}
              onPress={() => handleApprove(item)}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.actionBtnText}>Aceptar</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, busy && styles.btnDisabled]}
              onPress={() => { setRejectTarget(item.id); setRejectReason(''); }}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, styles.rejectBtnText]}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── APPROVED: confirm delivery with photos ── */}
        {item.status === 'approved' && (
          <TouchableOpacity
            style={[styles.deliveryBtn, deliveryUploadingId === item.id && styles.btnDisabled]}
            activeOpacity={0.8}
            onPress={() => handleConfirmDelivery(item)}
            disabled={deliveryUploadingId === item.id}
          >
            {deliveryUploadingId === item.id
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.deliveryBtnText}>He entregado el producto</Text>
            }
          </TouchableOpacity>
        )}

        {/* ── OWNER_DELIVERED: waiting for renter to confirm receipt ── */}
        {item.status === 'owner_delivered' && (
          <View style={styles.waitingInfo}>
            <Text style={styles.waitingText}>
              Esperando que {item.renterName ?? 'el arrendatario'} confirme que ha recibido el producto...
            </Text>
          </View>
        )}

        {/* ── ACTIVE: rental in progress, owner waits ── */}
        {item.status === 'active' && (
          <View style={styles.waitingInfo}>
            <Text style={styles.waitingText}>El alquiler está en curso</Text>
          </View>
        )}

        {/* ── RENTER_RETURNING / PENDING_OWNER_CONFIRMATION: show return photos + resolve ── */}
        {(item.status === 'renter_returning' || item.status === 'pending_owner_confirmation') && (
          <>
            {item.returnPhotos && item.returnPhotos.length > 0 && (
              <>
                <Text style={styles.photosLabel}>Fotos de devolución:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                  {item.returnPhotos.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                  ))}
                </ScrollView>
              </>
            )}
            <View style={styles.resolveRow}>
              <TouchableOpacity
                style={[styles.resolveBtn, styles.resolveBtnOk, confirmReturnLoadingId === item.id && styles.btnDisabled]}
                activeOpacity={0.8}
                onPress={() => handleConfirmReturn(item.id)}
                disabled={confirmReturnLoadingId === item.id}
              >
                {confirmReturnLoadingId === item.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.resolveBtnText}>Todo perfecto</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolveBtn, styles.resolveBtnDamage]}
                activeOpacity={0.8}
                onPress={() => { setDamageTarget(item); setDamageDescription(''); }}
              >
                <Text style={[styles.resolveBtnText, { color: '#ef4444' }]}>Hay daños</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── DISPUTE badge ── */}
        {item.disputeId && (
          <TouchableOpacity
            style={styles.disputeBtn}
            activeOpacity={0.8}
            onPress={() => router.push(`/dispute/${item.disputeId}`)}
          >
            <Text style={styles.disputeBtnText}>🔴 Disputa abierta — Ver disputa</Text>
          </TouchableOpacity>
        )}

        {/* ── COMPLETED: review button ── */}
        {canReview && (
          <TouchableOpacity
            style={styles.reviewBtn}
            activeOpacity={0.8}
            onPress={() => router.push(`/review/${item.id}` as any)}
          >
            <Text style={styles.reviewBtnText}>⭐ Valorar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Solicitudes recibidas</Text>
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
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No tienes solicitudes pendientes</Text>
            </View>
          }
        />
      )}

      {/* ── Rejection modal ── */}
      <Modal
        visible={rejectTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => { setRejectTarget(null); setRejectReason(''); }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Motivo del rechazo</Text>
            <Text style={styles.modalSubtitle}>Opcional — el arrendatario recibirá este motivo.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Ej. Fechas no disponibles..."
              placeholderTextColor="#9ca3af"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setRejectTarget(null); setRejectReason(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalRejectBtn}
                onPress={handleReject}
                activeOpacity={0.8}
                disabled={processingId === rejectTarget}
              >
                {processingId === rejectTarget
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalRejectText}>Rechazar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Damage report modal ── */}
      <Modal
        visible={damageTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => { setDamageTarget(null); setDamageDescription(''); }}
      >
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Descripción de los daños</Text>
            <Text style={styles.modalSubtitle}>Describe los daños encontrados para abrir una disputa.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Ej. Pantalla rayada, pieza rota..."
              placeholderTextColor="#9ca3af"
              value={damageDescription}
              onChangeText={setDamageDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setDamageTarget(null); setDamageDescription(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalRejectBtn, !damageDescription.trim() && styles.btnDisabled]}
                onPress={handleReportDamage}
                activeOpacity={0.8}
                disabled={!damageDescription.trim() || disputeLoadingId === damageTarget?.id}
              >
                {disputeLoadingId === damageTarget?.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalRejectText}>Crear disputa</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  listContent: { padding: 20, gap: 14 },
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
  productTitle: { fontSize: 15, fontWeight: '700', color: '#111827', lineHeight: 20, marginBottom: 6 },
  renterName: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  renterBold: { fontWeight: '600', color: '#374151' },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dateText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  dateSep: { fontSize: 13, color: '#9ca3af' },
  price: { fontSize: 15, fontWeight: '700', color: TEAL, marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  approveBtn: { backgroundColor: '#16a34a' },
  rejectBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ef4444' },
  btnDisabled: { opacity: 0.5 },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  rejectBtnText: { color: '#ef4444' },
  waitingInfo: {
    marginTop: 8, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
  },
  waitingText: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 18 },
  deliveryBtn: {
    marginTop: 4, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', backgroundColor: '#1d4ed8',
  },
  deliveryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  photosLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 12, marginBottom: 8 },
  photosScroll: { marginBottom: 12 },
  photoThumb: {
    width: 80, height: 80, borderRadius: 8, marginRight: 8, backgroundColor: '#f3f4f6',
  },
  resolveRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  resolveBtn: {
    flex: 1, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  resolveBtnOk: { backgroundColor: '#16a34a' },
  resolveBtnDamage: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#ef4444' },
  resolveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  reviewBtn: {
    marginTop: 12, borderWidth: 1.5, borderColor: '#f59e0b',
    borderRadius: 10, paddingVertical: 8,
    alignItems: 'center', backgroundColor: '#fffbeb',
  },
  reviewBtnText: { fontSize: 14, fontWeight: '700', color: '#b45309' },
  disputeBtn: {
    marginTop: 12, borderRadius: 10, paddingVertical: 9,
    alignItems: 'center', backgroundColor: '#fee2e2',
  },
  disputeBtnText: { fontSize: 13, fontWeight: '700', color: '#b91c1c' },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 14 },
  reasonInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, padding: 12,
    fontSize: 15, color: '#111827',
    height: 90, marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  modalRejectBtn: {
    flex: 1, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef4444',
  },
  modalRejectText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
