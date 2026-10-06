import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react-native';
import { db, auth } from '../lib/firebase';

const TEAL = '#4b9c78';

type Transaction = {
  id: string;
  type: string;
  amount: number;
  description?: string;
  status: string;
  createdAt: any;
};

const TX_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
  deposit:            { label: 'Ingreso',           color: '#16a34a', Icon: ArrowDownLeft },
  withdrawal:         { label: 'Retirada',          color: '#ef4444', Icon: ArrowUpRight },
  withdrawal_request: { label: 'Retirada pendiente',color: '#f59e0b', Icon: Clock },
  rental_payment:     { label: 'Pago alquiler',     color: '#ef4444', Icon: ArrowUpRight },
  rental_income:      { label: 'Cobro alquiler',    color: '#16a34a', Icon: ArrowDownLeft },
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(amount: number, type: string): string {
  const euros = (amount / 100).toFixed(2);
  const isCredit = type === 'deposit' || type === 'rental_income';
  return `${isCredit ? '+' : '-'}${euros}€`;
}

export default function WalletScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [iban, setIban] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      setUid(user.uid);
      try {
        const [walletSnap, txSnap] = await Promise.all([
          getDoc(doc(db, 'wallets', user.uid)),
          getDocs(
            query(
              collection(db, 'walletTransactions'),
              where('userId', '==', user.uid),
              orderBy('createdAt', 'desc'),
              limit(10),
            ),
          ),
        ]);

        setBalance(walletSnap.exists() ? (walletSnap.data().balance ?? 0) : 0);
        setTransactions(txSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction)));
      } catch (e) {
        console.error('Error loading wallet:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function handleWithdraw() {
    const trimmedIban = iban.trim().toUpperCase();
    const amountNum = parseFloat(amount);

    if (!trimmedIban) { Alert.alert('IBAN requerido', 'Introduce un IBAN válido.'); return; }
    if (isNaN(amountNum) || amountNum <= 0) { Alert.alert('Cantidad inválida', 'Introduce una cantidad mayor que 0.'); return; }

    const amountCents = Math.round(amountNum * 100);
    if (balance !== null && amountCents > balance) {
      Alert.alert('Saldo insuficiente', 'La cantidad supera tu saldo disponible.');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'walletTransactions'), {
        userId: uid,
        type: 'withdrawal_request',
        amount: amountCents,
        iban: trimmedIban,
        status: 'pending',
        description: `Retirada a ${trimmedIban}`,
        createdAt: Timestamp.now(),
      });
      setModalVisible(false);
      setIban('');
      setAmount('');
      Alert.alert('Solicitud enviada', 'Tu solicitud de retirada está siendo procesada.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo procesar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  function renderItem({ item }: { item: Transaction }) {
    const cfg = TX_CONFIG[item.type] ?? { label: item.type, color: '#6b7280', Icon: Clock };
    const { Icon } = cfg;
    const isCredit = item.type === 'deposit' || item.type === 'rental_income';
    return (
      <View style={styles.txRow}>
        <View style={[styles.txIconWrap, { backgroundColor: cfg.color + '18' }]}>
          <Icon size={18} color={cfg.color} strokeWidth={2} />
        </View>
        <View style={styles.txBody}>
          <Text style={styles.txLabel}>{cfg.label}</Text>
          {item.description ? <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text> : null}
          <Text style={styles.txDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.txRight}>
          <Text style={[styles.txAmount, { color: isCredit ? '#16a34a' : '#ef4444' }]}>
            {formatAmount(item.amount, item.type)}
          </Text>
          {item.status === 'pending' && (
            <Text style={styles.txPending}>Pendiente</Text>
          )}
        </View>
      </View>
    );
  }

  const balanceEuros = balance !== null ? (balance / 100).toFixed(2) : '—';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Monedero</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <>
          {/* Balance card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo disponible</Text>
            <Text style={styles.balanceAmount}>{balanceEuros}€</Text>
            <TouchableOpacity
              style={styles.withdrawBtn}
              activeOpacity={0.85}
              onPress={() => setModalVisible(true)}
            >
              <ArrowUpRight size={16} color="#fff" strokeWidth={2.5} />
              <Text style={styles.withdrawBtnText}>Retirar dinero</Text>
            </TouchableOpacity>
          </View>

          {/* Transaction list */}
          <Text style={styles.sectionLabel}>Últimas transacciones</Text>
          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No hay transacciones todavía</Text>
              </View>
            }
          />
        </>
      )}

      {/* Withdrawal modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setModalVisible(false); setIban(''); setAmount(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Retirar dinero</Text>
            <Text style={styles.modalSubtitle}>El importe se transferirá al IBAN indicado en 1–3 días hábiles.</Text>

            <Text style={styles.inputLabel}>IBAN</Text>
            <TextInput
              style={styles.input}
              placeholder="ES00 0000 0000 0000 0000 0000"
              placeholderTextColor="#9ca3af"
              value={iban}
              onChangeText={setIban}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>Cantidad (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            {(() => {
              const amountNum = parseFloat(amount);
              const maxEuros = balance !== null ? balance / 100 : null;
              if (maxEuros !== null && !isNaN(amountNum) && amountNum > maxEuros) {
                return (
                  <Text style={styles.amountError}>
                    No puedes retirar más de {maxEuros.toFixed(2)}€
                  </Text>
                );
              }
              return null;
            })()}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setModalVisible(false); setIban(''); setAmount(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              {(() => {
                const amountNum = parseFloat(amount);
                const maxEuros = balance !== null ? balance / 100 : null;
                const exceeded = maxEuros !== null && !isNaN(amountNum) && amountNum > maxEuros;
                return (
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (submitting || exceeded) && { opacity: 0.5 }]}
                onPress={handleWithdraw}
                activeOpacity={0.8}
                disabled={submitting || exceeded}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirmar</Text>
                )}
              </TouchableOpacity>
                );
              })()}
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  balanceCard: {
    margin: 20,
    backgroundColor: TEAL,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: TEAL, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceAmount: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 4 },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  withdrawBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  txIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txBody: { flex: 1 },
  txLabel: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 1 },
  txDesc: { fontSize: 12, color: '#6b7280', marginBottom: 1 },
  txDate: { fontSize: 12, color: '#9ca3af' },
  txRight: { alignItems: 'flex-end', gap: 3 },
  txAmount: { fontSize: 15, fontWeight: '700' },
  txPending: { fontSize: 11, color: '#f59e0b', fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#f3f4f6' },
  emptyWrap: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb',
  },
  amountError: { fontSize: 12, color: '#ef4444', marginTop: -10, marginBottom: 12 },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  modalConfirmBtn: {
    flex: 1, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TEAL,
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
