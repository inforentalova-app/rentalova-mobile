import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Share,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, Gift, CheckCircle, Clock } from 'lucide-react-native';
import { auth, db } from '../lib/firebase';

const TEAL = '#4b9c78';
const CREDIT_PER_REFERRAL = 5;

type Referral = {
  id: string;
  newUserId: string;
  newUserName?: string;
  createdAt?: string;
  status: 'pending' | 'completed';
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ReferralScreen() {
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        let code: string = snap.data()?.referralCode;

        if (!code) {
          code = user.uid.slice(0, 6).toUpperCase();
          await setDoc(userRef, { referralCode: code }, { merge: true });
        }
        setReferralCode(code);

        const refSnap = await getDocs(
          query(collection(db, 'referrals'), where('referrerId', '==', user.uid)),
        );
        setReferrals(
          refSnap.docs.map(d => ({ id: d.id, ...d.data() } as Referral))
            .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        );
      } catch (e) {
        console.error('Error loading referrals:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function handleShare() {
    await Share.share({
      message: `¡Únete a RentaLova con mi código ${referralCode} y consigue tu primer alquiler con descuento! https://www.rentalova.com`,
    });
  }

  const completedCount = referrals.filter(r => r.status === 'completed').length;
  const totalCredits = completedCount * CREDIT_PER_REFERRAL;

  function renderReferral({ item }: { item: Referral }) {
    const isCompleted = item.status === 'completed';
    return (
      <View style={styles.referralRow}>
        <View style={styles.referralAvatar}>
          <Text style={styles.referralInitial}>
            {(item.newUserName ?? '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.referralName}>{item.newUserName ?? 'Usuario'}</Text>
          {item.createdAt ? (
            <Text style={styles.referralDate}>{formatDate(item.createdAt)}</Text>
          ) : null}
        </View>
        <View style={[styles.referralStatus, isCompleted ? styles.statusCompleted : styles.statusPending]}>
          {isCompleted
            ? <CheckCircle size={12} color="#15803d" strokeWidth={2.5} />
            : <Clock size={12} color="#92400e" strokeWidth={2.5} />}
          <Text style={[styles.referralStatusText, isCompleted ? styles.statusCompletedText : styles.statusPendingText]}>
            {isCompleted ? `+${CREDIT_PER_REFERRAL}€` : 'Pendiente'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Invitar amigos</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={referrals}
          keyExtractor={item => item.id}
          renderItem={renderReferral}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* Hero */}
              <View style={styles.heroBox}>
                <Gift size={36} color={TEAL} strokeWidth={1.5} />
                <Text style={styles.heroTitle}>Gana 5€ por cada amigo</Text>
                <Text style={styles.heroDesc}>
                  Comparte tu código. Cuando un amigo se registre y complete su primer alquiler, los dos ganáis un crédito de 5€.
                </Text>
              </View>

              {/* Code card */}
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>TU CÓDIGO DE REFERIDO</Text>
                <Text style={styles.codeText}>{referralCode}</Text>
                <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
                  <Text style={styles.shareBtnText}>Compartir código</Text>
                </TouchableOpacity>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{referrals.length}</Text>
                  <Text style={styles.statLabel}>Referidos</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{completedCount}</Text>
                  <Text style={styles.statLabel}>Completados</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: TEAL }]}>{totalCredits}€</Text>
                  <Text style={styles.statLabel}>Créditos ganados</Text>
                </View>
              </View>

              {referrals.length > 0 && (
                <Text style={styles.sectionLabel}>TUS REFERIDOS</Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Aún no tienes referidos. ¡Comparte tu código!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { padding: 4, marginRight: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },

  listContent: { padding: 20, paddingBottom: 48 },

  heroBox: {
    alignItems: 'center',
    backgroundColor: '#f0faf5',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    gap: 10,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#111827', letterSpacing: -0.3, textAlign: 'center' },
  heroDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  codeCard: {
    borderWidth: 1.5,
    borderColor: '#d1fae5',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 4,
    marginBottom: 16,
  },
  shareBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
    marginBottom: 24,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#e5e7eb' },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 1,
    marginBottom: 12,
  },

  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  referralAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralInitial: { color: '#fff', fontWeight: '700', fontSize: 16 },
  referralName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  referralDate: { fontSize: 12, color: '#9ca3af' },
  referralStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusCompleted: { backgroundColor: '#dcfce7' },
  statusPending: { backgroundColor: '#fef9c3' },
  referralStatusText: { fontSize: 12, fontWeight: '700' },
  statusCompletedText: { color: '#15803d' },
  statusPendingText: { color: '#92400e' },

  emptyBox: { alignItems: 'center', paddingTop: 16 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
