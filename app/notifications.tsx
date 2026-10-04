import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, doc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Bell, ChevronLeft,
  CheckCircle, XCircle,
  CreditCard, Lock,
  Package, PackageCheck,
  RotateCcw, Star,
  CheckCircle2, Wallet,
  AlertTriangle, MessageCircle,
  AlertOctagon, ShieldCheck, ShieldX,
} from 'lucide-react-native';
import { db, auth } from '../lib/firebase';
import { useTheme } from '../hooks/useTheme';

const TEAL = '#4b9c78';

type Notification = {
  id: string;
  type?: string;
  title: string;
  read?: boolean;
  createdAt: any;
  actorName?: string;
  productName?: string;
  relatedId?: string;
  dateStart?: string;
  dateEnd?: string;
  messagePreview?: string;
  rating?: number;
};

type Section = { title: string; data: Notification[] };

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function relativeTime(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  if (hrs < 48) return 'Ayer';
  return `Hace ${Math.floor(hrs / 24)} dias`;
}

function getCardBg(type: string | undefined, isDark: boolean): string {
  if (isDark) {
    switch (type) {
      case 'request_approved':
      case 'delivery_confirmed':
      case 'rental_completed':
      case 'deposit_released':
      case 'new_review':
      case 'payment_received':
      case 'payment_confirmed':
      case 'verification_approved':
        return '#0a2318';
      case 'new_request':
      case 'deposit_pending':
      case 'delivery_pending':
      case 'delivery_reminder':
      case 'return_pending':
      case 'return_reminder':
      case 'review_pending':
        return '#241c08';
      case 'request_rejected':
      case 'deposit_retained':
      case 'dispute_opened':
      case 'verification_rejected':
        return '#250a0a';
      default:
        return '#1c1c1e';
    }
  }
  switch (type) {
    case 'request_approved':
    case 'delivery_confirmed':
    case 'rental_completed':
    case 'deposit_released':
    case 'new_review':
    case 'payment_received':
    case 'payment_confirmed':
    case 'verification_approved':
      return '#f0faf5';
    case 'new_request':
    case 'deposit_pending':
    case 'delivery_pending':
    case 'delivery_reminder':
    case 'return_pending':
    case 'return_reminder':
    case 'review_pending':
      return '#fffbeb';
    case 'request_rejected':
    case 'deposit_retained':
    case 'dispute_opened':
    case 'verification_rejected':
      return '#fef2f2';
    default:
      return '#ffffff';
  }
}

function getIconConfig(type?: string): { icon: React.ReactElement; bg: string } {
  const p = { size: 20, strokeWidth: 2 } as const;
  switch (type) {
    case 'new_request':
      return { icon: <Bell {...p} color="#3b82f6" />, bg: '#dbeafe' };
    case 'request_approved':
      return { icon: <CheckCircle {...p} color="#16a34a" />, bg: '#dcfce7' };
    case 'request_rejected':
      return { icon: <XCircle {...p} color="#ef4444" />, bg: '#fee2e2' };
    case 'payment_received':
    case 'payment_confirmed':
      return { icon: <CreditCard {...p} color="#3b82f6" />, bg: '#dbeafe' };
    case 'deposit_pending':
      return { icon: <Lock {...p} color="#f97316" />, bg: '#ffedd5' };
    case 'delivery_pending':
    case 'delivery_reminder':
      return { icon: <Package {...p} color="#3b82f6" />, bg: '#dbeafe' };
    case 'delivery_confirmed':
      return { icon: <PackageCheck {...p} color="#16a34a" />, bg: '#dcfce7' };
    case 'return_pending':
    case 'return_reminder':
      return { icon: <RotateCcw {...p} color="#f97316" />, bg: '#ffedd5' };
    case 'review_pending':
    case 'new_review':
      return { icon: <Star {...p} color="#f59e0b" fill="#f59e0b" />, bg: '#fef3c7' };
    case 'rental_completed':
      return { icon: <CheckCircle2 {...p} color="#16a34a" />, bg: '#dcfce7' };
    case 'deposit_released':
      return { icon: <Wallet {...p} color="#16a34a" />, bg: '#dcfce7' };
    case 'deposit_retained':
      return { icon: <AlertTriangle {...p} color="#ef4444" />, bg: '#fee2e2' };
    case 'new_message':
      return { icon: <MessageCircle {...p} color="#3b82f6" />, bg: '#dbeafe' };
    case 'dispute_opened':
      return { icon: <AlertOctagon {...p} color="#ef4444" />, bg: '#fee2e2' };
    case 'verification_approved':
      return { icon: <ShieldCheck {...p} color="#16a34a" />, bg: '#dcfce7' };
    case 'verification_rejected':
      return { icon: <ShieldX {...p} color="#ef4444" />, bg: '#fee2e2' };
    default:
      return { icon: <Bell {...p} color="#9ca3af" />, bg: '#f3f4f6' };
  }
}

function getBodyText(item: Notification): string {
  const actor = item.actorName ?? 'Alguien';
  const product = item.productName ?? 'un producto';
  const ds = item.dateStart ? shortDate(item.dateStart) : '?';
  const de = item.dateEnd ? shortDate(item.dateEnd) : '?';
  const preview = item.messagePreview ?? '';
  const rating = item.rating ?? 5;

  switch (item.type) {
    case 'request_approved':
      return `Tu solicitud para alquilar ${product} ha sido aprobada. Completa el pago para confirmar tu reserva.`;
    case 'request_rejected':
      return `Tu solicitud para alquilar ${product} ha sido rechazada por el propietario.`;
    case 'deposit_pending':
      return `Autoriza la fianza para confirmar tu reserva de ${product}. Sin esto la reserva puede cancelarse.`;
    case 'delivery_confirmed':
      return `${actor} ha confirmado que has recibido ${product}. Ya puedes empezar a disfrutarlo.`;
    case 'return_reminder':
      return `El plazo de devolucion de ${product} se acerca. Coordina con ${actor} para entregarlo a tiempo.`;
    case 'rental_completed':
      return `Tu alquiler de ${product} ha finalizado. Comparte tu experiencia dejando una valoracion.`;
    case 'deposit_released':
      return `Tu fianza por el alquiler de ${product} ha sido liberada. El importe ya esta disponible.`;
    case 'deposit_retained':
      return `La fianza de tu alquiler de ${product} ha sido retenida debido a una incidencia reportada.`;
    case 'new_request':
      return `${actor} quiere alquilar ${product} del ${ds} al ${de}.`;
    case 'payment_received':
    case 'payment_confirmed':
      return `${actor} ha realizado el pago por el alquiler de ${product}. Confirma la entrega cuando esteis listos.`;
    case 'delivery_reminder':
      return `Recuerda entregar ${product} a ${actor} segun lo acordado. Haz fotos del estado antes de la entrega.`;
    case 'return_pending':
      return `${actor} ha iniciado la devolucion de ${product}. Confirma la recepcion cuando lo tengas.`;
    case 'new_review':
      return `${actor} te ha valorado con ${rating} estrellas por el alquiler de ${product}.`;
    case 'new_message':
      return preview ? `${actor}: ${preview}` : `${actor} te ha enviado un mensaje nuevo.`;
    case 'verification_approved':
      return 'Tu identidad ha sido verificada correctamente. Ya puedes alquilar con total confianza.';
    case 'verification_rejected':
      return 'No pudimos verificar tu identidad. Revisa los documentos e intentalo de nuevo.';
    case 'dispute_opened':
      return `Se ha abierto una disputa en el alquiler de ${product}. Nuestro equipo esta revisando el caso.`;
    case 'review_pending':
      return `Como fue tu experiencia con ${product}? Comparte tu opinion con la comunidad.`;
    default:
      return '';
  }
}

function getNavTarget(item: Notification): string | null {
  switch (item.type) {
    case 'new_request': return '/requests';
    case 'request_approved':
    case 'deposit_pending':
    case 'deposit_released':
      return '/my-rentals';
    case 'request_rejected':
    case 'verification_approved':
      return '/(tabs)/';
    case 'payment_received':
    case 'payment_confirmed':
    case 'delivery_pending':
    case 'delivery_reminder':
    case 'return_pending':
      return '/requests';
    case 'delivery_confirmed':
    case 'return_reminder':
      return item.relatedId ? `/rental-detail/${item.relatedId}` : '/my-rentals';
    case 'rental_completed':
    case 'review_pending':
      return item.relatedId ? `/review/${item.relatedId}` : null;
    case 'new_review': return '/my-products';
    case 'deposit_retained':
    case 'dispute_opened':
      return item.relatedId ? `/dispute/${item.relatedId}` : null;
    case 'new_message':
      return item.relatedId ? `/chat/${item.relatedId}` : null;
    case 'verification_rejected': return '/verification';
    default: return null;
  }
}

type ActionConfig = { label: string; dest: string; variant?: 'danger' };

function getActionConfig(item: Notification): ActionConfig | null {
  switch (item.type) {
    case 'request_approved':
      return { label: 'Pagar ahora', dest: '/my-rentals' };
    case 'request_rejected':
      return { label: 'Buscar productos', dest: '/(tabs)/' };
    case 'deposit_pending':
      return { label: 'Autorizar fianza', dest: '/my-rentals' };
    case 'delivery_confirmed':
      return { label: 'Ver alquiler', dest: item.relatedId ? `/rental-detail/${item.relatedId}` : '/my-rentals' };
    case 'return_reminder':
      return { label: 'Ver alquiler', dest: item.relatedId ? `/rental-detail/${item.relatedId}` : '/my-rentals' };
    case 'rental_completed':
      return item.relatedId ? { label: 'Valorar ahora', dest: `/review/${item.relatedId}` } : null;
    case 'deposit_retained':
      return item.relatedId ? { label: 'Ver disputa', dest: `/dispute/${item.relatedId}` } : null;
    case 'payment_received':
    case 'payment_confirmed':
    case 'delivery_reminder':
      return { label: 'Ver solicitudes', dest: '/requests' };
    case 'return_pending':
      return { label: 'Confirmar devolucion', dest: '/requests' };
    case 'new_message':
      return item.relatedId ? { label: 'Responder', dest: `/chat/${item.relatedId}` } : null;
    case 'verification_approved':
      return { label: 'Explorar productos', dest: '/(tabs)/' };
    case 'verification_rejected':
      return { label: 'Reintentar', dest: '/verification', variant: 'danger' };
    case 'review_pending':
      return item.relatedId ? { label: 'Valorar ahora', dest: `/review/${item.relatedId}` } : null;
    default:
      return null;
  }
}

function groupByDate(items: Notification[]): Section[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const buckets: Record<string, Notification[]> = {
    Hoy: [], Ayer: [], 'Esta semana': [], Anteriores: [],
  };

  for (const n of items) {
    const t = n.createdAt?.toDate
      ? n.createdAt.toDate().getTime()
      : new Date(n.createdAt ?? 0).getTime();
    if (t >= todayStart) buckets['Hoy'].push(n);
    else if (t >= yesterdayStart) buckets['Ayer'].push(n);
    else if (t >= weekStart) buckets['Esta semana'].push(n);
    else buckets['Anteriores'].push(n);
  }

  return (['Hoy', 'Ayer', 'Esta semana', 'Anteriores'] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ title: k, data: buckets[k] }));
}

function usePulse() {
  const anim = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    ).start();
    return () => anim.stopAnimation();
  }, [anim]);
  return anim;
}

function SkeletonCard({ colors }: { colors: any }) {
  const opacity = usePulse();
  const bg = colors.border;
  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.card, opacity }]}>
      <View style={styles.cardTop}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg }} />
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 13, width: '60%', borderRadius: 6, backgroundColor: bg }} />
          <View style={{ height: 10, width: '28%', borderRadius: 5, backgroundColor: bg }} />
        </View>
      </View>
      <View style={{ paddingLeft: 52, gap: 5 }}>
        <View style={{ height: 11, width: '95%', borderRadius: 5, backgroundColor: bg }} />
        <View style={{ height: 11, width: '70%', borderRadius: 5, backgroundColor: bg }} />
      </View>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, 'approving' | 'rejecting'>>({});
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
        setSections(groupByDate(items));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  async function markRead(id: string) {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch {}
  }

  async function handlePress(item: Notification) {
    if (!item.read) await markRead(item.id);
    const target = getNavTarget(item);
    if (target) router.push(target as any);
  }

  async function handleActionPress(item: Notification, dest: string) {
    if (!item.read) await markRead(item.id);
    router.push(dest as any);
  }

  async function handleApprove(item: Notification) {
    if (!item.relatedId || actionLoading[item.id]) return;
    setActionLoading((p) => ({ ...p, [item.id]: 'approving' }));
    try {
      await Promise.all([
        updateDoc(doc(db, 'rentals', item.relatedId), { status: 'approved' }),
        markRead(item.id),
      ]);
    } catch (e) {
      console.error('approve error:', e);
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
  }

  async function handleReject(item: Notification) {
    if (!item.relatedId || actionLoading[item.id]) return;
    setActionLoading((p) => ({ ...p, [item.id]: 'rejecting' }));
    try {
      await Promise.all([
        updateDoc(doc(db, 'rentals', item.relatedId), { status: 'rejected' }),
        markRead(item.id),
      ]);
    } catch (e) {
      console.error('reject error:', e);
    } finally {
      setActionLoading((p) => { const n = { ...p }; delete n[item.id]; return n; });
    }
  }

  function renderItem({ item }: { item: Notification }) {
    const unread = !item.read;
    const { icon, bg } = getIconConfig(item.type);
    const cardBg = getCardBg(item.type, isDark);
    const bodyText = getBodyText(item);
    const isNewRequest = item.type === 'new_request';
    const actionConfig = isNewRequest ? null : getActionConfig(item);
    const loadState = actionLoading[item.id];

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: cardBg }]}
        activeOpacity={0.85}
        onPress={() => handlePress(item)}
      >
        {unread && <View style={styles.unreadDot} />}

        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: bg }]}>
            {icon}
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardTime}>{relativeTime(item.createdAt)}</Text>
          </View>
        </View>

        {!!bodyText && (
          <Text style={[styles.cardBody, { color: isDark ? '#9ca3af' : '#374151' }]}>
            {bodyText}
          </Text>
        )}

        {isNewRequest && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionApprove]}
              activeOpacity={0.8}
              disabled={!!loadState}
              onPress={() => handleApprove(item)}
            >
              {loadState === 'approving' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Aceptar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionReject]}
              activeOpacity={0.8}
              disabled={!!loadState}
              onPress={() => handleReject(item)}
            >
              {loadState === 'rejecting' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>Rechazar</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {!isNewRequest && actionConfig && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                actionConfig.variant === 'danger' ? styles.actionDanger : styles.actionTeal,
              ]}
              activeOpacity={0.8}
              onPress={() => handleActionPress(item, actionConfig.dest)}
            >
              <Text style={styles.actionBtnText}>{actionConfig.label}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderSectionHeader({ section }: { section: Section }) {
    return (
      <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionHeaderText, { color: colors.textLight }]}>
          {section.title}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Notificaciones</Text>
      </View>

      {loading ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonCard key={i} colors={colors} />)}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 600);
              }}
              tintColor={TEAL}
              colors={[TEAL]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Bell size={52} color={colors.border} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Estas al dia</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textLight }]}>
                No tienes notificaciones nuevas
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5 },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 14,
    padding: 14,
  },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardMeta: {
    flex: 1,
    paddingRight: 18,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  cardTime: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
    paddingLeft: 52,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 52,
    marginTop: 2,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
    minHeight: 34,
  },
  actionTeal: { backgroundColor: TEAL },
  actionApprove: { backgroundColor: '#16a34a' },
  actionReject: { backgroundColor: '#ef4444' },
  actionDanger: { backgroundColor: '#ef4444' },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: {
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
