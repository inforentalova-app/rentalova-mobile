import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, onSnapshot, getDocs, collection, query, where, updateDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import {
  ChevronLeft, CheckCircle, Circle, MessageCircle, Package,
  CreditCard, Lock, Clock, RotateCcw, Star, XCircle, AlertTriangle,
} from 'lucide-react-native';
import { db, auth, storage } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';
const W = Dimensions.get('window').width;

type RentalDetail = {
  id: string;
  rentalId?: string;
  productId: string;
  productTitle: string;
  productPhotoUrl?: string;
  renterId: string;
  renterName: string;
  ownerId: string;
  ownerName: string;
  ownerPhotoUrl?: string;
  startDate: any;
  endDate: any;
  days?: number;
  pricePerDay?: number;
  totalPrice?: number;
  deposit?: number;
  status: string;
  message?: string;
  rejectionReason?: string;
  createdAt: any;
  approvedAt?: any;
  paidAt?: any;
  deliveredAt?: any;
  returnedAt?: any;
  completedAt?: any;
  ownerConfirmedAt?: any;
  paymentStatus?: string;
  depositStatus?: string;
  depositRetainedAmount?: number;
  depositRetainedReason?: string;
  deliveryPhotos?: string[];
  returnPhotos?: string[];
  ownerReturnPhotos?: string[];
  disputeId?: string;
  conversationId?: string;
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending:                    { label: 'Pendiente de aprobación',              bg: '#fef9c3', text: '#a16207' },
  payment_pending:            { label: 'Pago pendiente',                       bg: '#fef9c3', text: '#a16207' },
  deposit_pending:            { label: 'Fianza pendiente',                     bg: '#fff7ed', text: '#c2410c' },
  approved:                   { label: 'Aprobado · Pendiente de entrega',      bg: '#dbeafe', text: '#1d4ed8' },
  active:                     { label: 'En curso',                             bg: '#dcfce7', text: '#15803d' },
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

const PAST_PAYMENT = new Set(['approved', 'deposit_pending', 'active', 'pending_owner_confirmation', 'completed']);
const PAST_DELIVERY = new Set(['active', 'pending_owner_confirmation', 'completed']);
const PAST_RETURN   = new Set(['pending_owner_confirmation', 'completed']);

type StepDef = {
  key: string;
  label: string;
  sublabel?: string;
  done: boolean;
  rejected?: boolean;
  date: any;
};

function buildSteps(r: RentalDetail): StepDef[] {
  const s = r.status;
  const isRejected = s === 'rejected' || s === 'cancelled';
  return [
    {
      key: 'request',
      label: 'Solicitud enviada',
      done: true,
      date: r.createdAt,
    },
    {
      key: 'approved',
      label: isRejected ? (s === 'rejected' ? 'Solicitud rechazada' : 'Solicitud cancelada') : 'Solicitud aprobada',
      done: !['pending', 'rejected', 'cancelled'].includes(s),
      rejected: isRejected,
      date: r.approvedAt ?? null,
    },
    {
      key: 'paid',
      label: 'Pago completado',
      done: PAST_PAYMENT.has(s) || r.paymentStatus === 'paid',
      date: r.paidAt ?? null,
    },
    {
      key: 'delivered',
      label: 'Producto entregado',
      done: PAST_DELIVERY.has(s),
      date: r.deliveredAt ?? null,
    },
    {
      key: 'active',
      label: 'En curso',
      sublabel: `${formatDate(r.startDate)} — ${formatDate(r.endDate)}`,
      done: PAST_DELIVERY.has(s),
      date: null,
    },
    {
      key: 'returned',
      label: 'Producto devuelto',
      done: PAST_RETURN.has(s),
      date: r.returnedAt ?? null,
    },
    {
      key: 'completed',
      label: 'Completado',
      done: s === 'completed',
      date: r.completedAt ?? r.ownerConfirmedAt ?? null,
    },
  ];
}

function TimelineStep({
  step, isLast, colors,
}: {
  step: StepDef; isLast: boolean; colors: any;
}) {
  const dotColor = step.rejected ? '#ef4444' : step.done ? '#16a34a' : colors.border;
  const connectorColor = step.done ? '#16a34a' : colors.border;

  return (
    <View style={tls.row}>
      <View style={tls.track}>
        <View style={tls.dotWrap}>
          {step.done && !step.rejected && (
            <CheckCircle size={22} color="#16a34a" strokeWidth={2} />
          )}
          {step.rejected && (
            <XCircle size={22} color="#ef4444" strokeWidth={2} />
          )}
          {!step.done && !step.rejected && (
            <Circle size={22} color={dotColor} strokeWidth={2} />
          )}
        </View>
        {!isLast && (
          <View style={[tls.connector, { backgroundColor: connectorColor }]} />
        )}
      </View>
      <View style={tls.body}>
        <Text style={[
          tls.label,
          step.done && !step.rejected ? tls.labelDone : tls.labelPending,
          step.rejected ? tls.labelRejected : null,
        ]}>
          {step.label}
        </Text>
        {!!step.sublabel && (
          <Text style={[tls.sublabel, { color: colors.textLight }]}>{step.sublabel}</Text>
        )}
        {!!step.date && (
          <Text style={[tls.date, { color: colors.textLight }]}>{formatDate(step.date)}</Text>
        )}
        {!step.done && !step.date && !step.sublabel && (
          <Text style={[tls.date, { color: colors.textLight }]}>Pendiente</Text>
        )}
      </View>
    </View>
  );
}

const tls = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  track: { alignItems: 'center', width: 22 },
  dotWrap: { width: 22, height: 22 },
  connector: { flex: 1, width: 2, borderRadius: 1, minHeight: 18, marginVertical: 3 },
  body: { flex: 1, paddingBottom: 18, paddingTop: 1 },
  label: { fontSize: 14, fontWeight: '600', lineHeight: 22 },
  labelDone: { color: '#111827' },
  labelPending: { color: '#9ca3af' },
  labelRejected: { color: '#ef4444' },
  sublabel: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  date: { fontSize: 12, marginTop: 2 },
});

function Avatar({ name, url, size = 36 }: { name: string; url?: string; size?: number }) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: TEAL + '22', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: TEAL }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export default function RentalDetailScreen() {
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const { colors, isDark } = useTheme();

  const [rental, setRental] = useState<RentalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewedAlready, setReviewedAlready] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [paymentLoading, setPaymentLoading]     = useState(false);
  const [depositLoading, setDepositLoading]     = useState(false);
  const [confirmLoading, setConfirmLoading]     = useState(false);
  const [returnLoading, setReturnLoading]       = useState(false);
  const [contactLoading, setContactLoading]     = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!rentalId) return;
    const unsub = onSnapshot(doc(db, 'rentals', rentalId), async (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() } as RentalDetail;
      setRental(data);
      setLoading(false);

      if (auth.currentUser) {
        try {
          const reviewSnap = await getDocs(
            query(
              collection(db, 'reviews'),
              where('reviewerId', '==', auth.currentUser.uid),
              where('rentalId', '==', rentalId),
            ),
          );
          setReviewedAlready(!reviewSnap.empty);
        } catch {}
      }
    }, () => setLoading(false));
    return unsub;
  }, [rentalId]);

  async function handlePayNow() {
    if (!auth.currentUser || !rental) return;
    const rid = rental.rentalId ?? rental.id;
    setPaymentLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('https://www.rentalova.com/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ rentalId: rid }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Error ${res.status}`);
      const { checkoutUrl } = await res.json();
      if (!checkoutUrl) throw new Error('No se recibió la URL de pago.');
      await Linking.openURL(checkoutUrl);
    } catch (e: any) {
      Alert.alert('Error al pagar', e.message ?? 'No se pudo iniciar el proceso de pago.');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleDepositAuth() {
    if (!auth.currentUser || !rental) return;
    const rid = rental.rentalId ?? rental.id;
    setDepositLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('https://www.rentalova.com/api/refresh-deposit-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ rentalId: rid }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Error ${res.status}`);
      const { depositCheckoutUrl } = await res.json();
      if (!depositCheckoutUrl) throw new Error('No se recibió la URL de autorización.');
      await Linking.openURL(depositCheckoutUrl);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo iniciar la autorización de la fianza.');
    } finally {
      setDepositLoading(false);
    }
  }

  async function handleConfirmReceipt() {
    if (!rental) return;
    setConfirmLoading(true);
    try {
      await updateDoc(doc(db, 'rentals', rental.id), { status: 'active' });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo confirmar la recepción.');
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleMarkReturned() {
    if (!rental) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;

    const rid = rental.rentalId ?? rental.id;
    setReturnLoading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const blob = await (await fetch(result.assets[i].uri)).blob();
        const sRef = storageRef(storage, `rentals/${rid}/return/${Date.now()}_${i}`);
        await uploadBytes(sRef, blob);
        urls.push(await getDownloadURL(sRef));
      }
      await updateDoc(doc(db, 'rentals', rental.id), {
        returnPhotos: urls,
        status: 'pending_owner_confirmation',
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo marcar como devuelto.');
    } finally {
      setReturnLoading(false);
    }
  }

  async function handleContact() {
    if (!rental) return;
    setContactLoading(true);
    try {
      if (rental.conversationId) {
        router.push(`/chat/${rental.conversationId}` as any);
        return;
      }
      const snap = await getDocs(
        query(collection(db, 'conversations'), where('rentalId', '==', rental.id)),
      );
      if (!snap.empty) {
        router.push(`/chat/${snap.docs[0].id}` as any);
      } else {
        router.push('/messages' as any);
      }
    } catch {
      router.push('/messages' as any);
    } finally {
      setContactLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[s.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.back}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Detalle del alquiler</Text>
        </View>
        <ActivityIndicator size="large" color={TEAL} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!rental) {
    return (
      <View style={[s.flex, { backgroundColor: colors.background }]}>
        <View style={[s.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.back}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Detalle del alquiler</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Package size={48} color={colors.border} strokeWidth={1.5} />
          <Text style={{ color: colors.textLight, fontSize: 15 }}>Alquiler no encontrado</Text>
        </View>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[rental.status] ?? { label: rental.status, bg: '#f3f4f6', text: '#6b7280' };
  const steps = buildSteps(rental);
  const rid = rental.rentalId ?? rental.id;
  const canReview = rental.status === 'completed' && !reviewedAlready;

  const depositLabel = rental.depositStatus === 'released'
    ? 'Liberada'
    : rental.depositStatus === 'retained'
      ? `Retenida${rental.depositRetainedAmount ? ` (${rental.depositRetainedAmount}€)` : ''}`
      : rental.depositStatus === 'held'
        ? 'Reservada (pendiente de liberar)'
        : 'Pendiente';

  const depositColor = rental.depositStatus === 'released'
    ? '#15803d'
    : rental.depositStatus === 'retained'
      ? '#b91c1c'
      : colors.textLight;

  const allPhotos = [
    ...(rental.deliveryPhotos ?? []),
    ...(rental.returnPhotos ?? []),
    ...(rental.ownerReturnPhotos ?? []),
  ];

  return (
    <View style={[s.flex, { backgroundColor: colors.background }]}>
      {/* Fixed header */}
      <View style={[s.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.back}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Detalle del alquiler
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Product banner ─────────────────────────────────────────────── */}
        <View style={s.bannerWrap}>
          {rental.productPhotoUrl ? (
            <Image source={{ uri: rental.productPhotoUrl }} style={s.banner} resizeMode="cover" />
          ) : (
            <View style={[s.banner, s.bannerPlaceholder, { backgroundColor: isDark ? '#1c1c1e' : '#f3f4f6' }]}>
              <Package size={52} color={colors.border} strokeWidth={1.5} />
            </View>
          )}
          <View style={s.bannerOverlay} />
          <View style={s.bannerContent}>
            <Text style={s.bannerTitle} numberOfLines={2}>{rental.productTitle}</Text>
            <View style={[s.badge, { backgroundColor: cfg.bg }]}>
              <Text style={[s.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
            </View>
          </View>
        </View>

        {/* ── Rejection reason ───────────────────────────────────────────── */}
        {rental.rejectionReason ? (
          <View style={[s.alertBox, { borderColor: '#fca5a5', backgroundColor: isDark ? '#2d1111' : '#fef2f2' }]}>
            <AlertTriangle size={16} color="#ef4444" strokeWidth={2} />
            <Text style={[s.alertText, { color: isDark ? '#f87171' : '#b91c1c' }]}>
              Motivo: {rental.rejectionReason}
            </Text>
          </View>
        ) : null}

        {/* ── Timeline ───────────────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Proceso del alquiler</Text>
          <View style={{ paddingTop: 8 }}>
            {steps.map((step, idx) => (
              <TimelineStep
                key={step.key}
                step={step}
                isLast={idx === steps.length - 1}
                colors={colors}
              />
            ))}
          </View>
        </View>

        {/* ── Details ────────────────────────────────────────────────────── */}
        <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Detalles</Text>

          {/* Owner */}
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: colors.textLight }]}>Propietario</Text>
            <View style={s.personRow}>
              <Avatar name={rental.ownerName} url={rental.ownerPhotoUrl} size={28} />
              <Text style={[s.detailValue, { color: colors.text }]}>{rental.ownerName}</Text>
            </View>
          </View>

          {/* Dates */}
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: colors.textLight }]}>Fecha inicio</Text>
            <Text style={[s.detailValue, { color: colors.text }]}>{formatDate(rental.startDate)}</Text>
          </View>
          <View style={s.detailRow}>
            <Text style={[s.detailLabel, { color: colors.textLight }]}>Fecha fin</Text>
            <Text style={[s.detailValue, { color: colors.text }]}>{formatDate(rental.endDate)}</Text>
          </View>
          {rental.days != null && (
            <View style={s.detailRow}>
              <Text style={[s.detailLabel, { color: colors.textLight }]}>Duracion</Text>
              <Text style={[s.detailValue, { color: colors.text }]}>{rental.days} {rental.days === 1 ? 'dia' : 'dias'}</Text>
            </View>
          )}

          {/* Price */}
          {rental.totalPrice != null && (
            <View style={s.detailRow}>
              <Text style={[s.detailLabel, { color: colors.textLight }]}>Precio total</Text>
              <Text style={[s.detailValue, s.detailValueBold, { color: TEAL }]}>{rental.totalPrice}€</Text>
            </View>
          )}

          {/* Deposit */}
          {(rental.deposit != null && rental.deposit > 0) && (
            <>
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.textLight }]}>Fianza</Text>
                <Text style={[s.detailValue, { color: colors.text }]}>{rental.deposit}€</Text>
              </View>
              <View style={s.detailRow}>
                <Text style={[s.detailLabel, { color: colors.textLight }]}>Estado fianza</Text>
                <Text style={[s.detailValue, { color: depositColor, fontWeight: '600' }]}>{depositLabel}</Text>
              </View>
              {rental.depositRetainedReason ? (
                <View style={s.detailRow}>
                  <Text style={[s.detailLabel, { color: colors.textLight }]}>Motivo retención</Text>
                  <Text style={[s.detailValue, { color: colors.text, flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                    {rental.depositRetainedReason}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* ── Delivery photos ─────────────────────────────────────────────── */}
        {(rental.deliveryPhotos?.length ?? 0) > 0 && (
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Fotos de entrega</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {rental.deliveryPhotos!.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={s.thumb} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Return photos ───────────────────────────────────────────────── */}
        {((rental.returnPhotos?.length ?? 0) + (rental.ownerReturnPhotos?.length ?? 0)) > 0 && (
          <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Fotos de devolucion</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {[...(rental.returnPhotos ?? []), ...(rental.ownerReturnPhotos ?? [])].map((url, i) => (
                <Image key={i} source={{ uri: url }} style={s.thumb} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View style={s.actionsSection}>

          {rental.status === 'payment_pending' && (
            <TouchableOpacity
              style={[s.btn, s.btnAmber, paymentLoading && s.btnDisabled]}
              activeOpacity={0.8}
              onPress={handlePayNow}
              disabled={paymentLoading}
            >
              {paymentLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><CreditCard size={16} color="#fff" strokeWidth={2} /><Text style={s.btnText}>Pagar ahora</Text></>
              }
            </TouchableOpacity>
          )}

          {rental.status === 'deposit_pending' && (
            <TouchableOpacity
              style={[s.btn, s.btnOrange, depositLoading && s.btnDisabled]}
              activeOpacity={0.8}
              onPress={handleDepositAuth}
              disabled={depositLoading}
            >
              {depositLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Lock size={16} color="#fff" strokeWidth={2} /><Text style={s.btnText}>Autorizar fianza</Text></>
              }
            </TouchableOpacity>
          )}

          {rental.status === 'approved' && (
            <TouchableOpacity
              style={[s.btn, s.btnBlue, confirmLoading && s.btnDisabled]}
              activeOpacity={0.8}
              onPress={handleConfirmReceipt}
              disabled={confirmLoading}
            >
              {confirmLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><CheckCircle size={16} color="#fff" strokeWidth={2} /><Text style={s.btnText}>Confirmar recepción</Text></>
              }
            </TouchableOpacity>
          )}

          {rental.status === 'active' && (
            <TouchableOpacity
              style={[s.btn, s.btnTeal, returnLoading && s.btnDisabled]}
              activeOpacity={0.8}
              onPress={handleMarkReturned}
              disabled={returnLoading}
            >
              {returnLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><RotateCcw size={16} color="#fff" strokeWidth={2} /><Text style={s.btnText}>Marcar como devuelto</Text></>
              }
            </TouchableOpacity>
          )}

          {canReview && (
            <TouchableOpacity
              style={[s.btn, s.btnReview]}
              activeOpacity={0.8}
              onPress={() => router.push(`/review/${rental.id}` as any)}
            >
              <Star size={16} color="#b45309" strokeWidth={2} />
              <Text style={[s.btnText, { color: '#b45309' }]}>Valorar alquiler</Text>
            </TouchableOpacity>
          )}

          {rental.disputeId && (
            <TouchableOpacity
              style={[s.btn, s.btnDispute]}
              activeOpacity={0.8}
              onPress={() => router.push(`/dispute/${rental.disputeId}` as any)}
            >
              <AlertTriangle size={16} color="#ef4444" strokeWidth={2} />
              <Text style={[s.btnText, { color: '#ef4444' }]}>Ver disputa</Text>
            </TouchableOpacity>
          )}

          {/* Contact button — always shown */}
          <TouchableOpacity
            style={[s.btn, s.btnContact, { borderColor: colors.border }, contactLoading && s.btnDisabled]}
            activeOpacity={0.8}
            onPress={handleContact}
            disabled={contactLoading}
          >
            {contactLoading
              ? <ActivityIndicator color={TEAL} size="small" />
              : <><MessageCircle size={16} color={TEAL} strokeWidth={2} /><Text style={[s.btnText, { color: TEAL }]}>Contactar</Text></>
            }
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  back: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, flex: 1 },

  bannerWrap: { position: 'relative', width: W, height: 220 },
  banner: { width: W, height: 220 },
  bannerPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  bannerOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bannerContent: {
    position: 'absolute', bottom: 16, left: 20, right: 20, gap: 8,
  },
  bannerTitle: {
    fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5, lineHeight: 28,
  },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 12, borderRadius: 10,
    borderWidth: 1, padding: 12,
  },
  alertText: { fontSize: 13, flex: 1, lineHeight: 18 },

  section: {
    marginHorizontal: 16, marginTop: 14, borderRadius: 14,
    borderWidth: 1, padding: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4, letterSpacing: -0.3 },

  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f640',
  },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  detailValueBold: { fontSize: 15, fontWeight: '700' },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  thumb: {
    width: 100, height: 100, borderRadius: 10,
    marginRight: 10, backgroundColor: '#e5e7eb',
  },

  actionsSection: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 13, gap: 8,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  btnTeal:    { backgroundColor: TEAL },
  btnAmber:   { backgroundColor: '#f59e0b' },
  btnOrange:  { backgroundColor: '#ea580c' },
  btnBlue:    { backgroundColor: '#1d4ed8' },
  btnReview:  { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#f59e0b' },
  btnDispute: { backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#ef4444' },
  btnContact: { backgroundColor: 'transparent', borderWidth: 1.5 },
});
