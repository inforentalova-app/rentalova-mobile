import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronLeft, CreditCard, CheckCircle } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';

const TEAL = '#4b9c78';

type Rental = {
  id: string;
  productTitle: string;
  startDate: any;
  endDate: any;
  totalPrice: number | null;
  deposit?: number | null;
  status: string;
};

function formatDate(ts: any): string {
  if (!ts) return '—';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAID_STATUSES = new Set(['paid', 'active', 'completed']);

export default function PaymentScreen() {
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const loadRental = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'rentals', rentalId));
      if (snap.exists()) setRental({ id: snap.id, ...snap.data() } as Rental);
    } catch (e) {
      console.error('Error loading rental for payment:', e);
    } finally {
      setLoading(false);
    }
  }, [rentalId]);

  useEffect(() => {
    loadRental();
  }, [loadRental]);

  // Refresh when app comes back to foreground (user returns from browser after payment)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadRental();
    });
    return () => sub.remove();
  }, [loadRental]);

  async function handlePay() {
    const user = auth.currentUser;
    if (!user) { router.replace('/(auth)/login'); return; }
    setPaying(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('https://www.rentalova.com/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentalId, idToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Error ${res.status}`);
      }
      const { url } = await res.json();
      if (!url) throw new Error('No se recibió la URL de pago.');
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Error al pagar', e.message ?? 'No se pudo iniciar el proceso de pago.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TEAL} /></View>;
  }

  if (!rental) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.title}>Pago</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Alquiler no encontrado</Text>
        </View>
      </View>
    );
  }

  const isPaid = PAID_STATUSES.has(rental.status);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>{isPaid ? 'Pago completado' : 'Pagar alquiler'}</Text>
      </View>

      <View style={styles.content}>

        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.productTitle} numberOfLines={2}>{rental.productTitle}</Text>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fecha de inicio</Text>
            <Text style={styles.summaryValue}>{formatDate(rental.startDate)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fecha de fin</Text>
            <Text style={styles.summaryValue}>{formatDate(rental.endDate)}</Text>
          </View>

          {rental.totalPrice != null && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Precio total</Text>
              <Text style={[styles.summaryValue, styles.summaryPrice]}>{rental.totalPrice}€</Text>
            </View>
          )}
          {rental.deposit != null && rental.deposit > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Fianza</Text>
              <Text style={styles.summaryValue}>{rental.deposit}€</Text>
            </View>
          )}
          {rental.totalPrice != null && rental.deposit != null && rental.deposit > 0 && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { fontWeight: '700', color: '#111827' }]}>Total a pagar</Text>
                <Text style={[styles.summaryValue, styles.summaryTotal]}>
                  {rental.totalPrice + rental.deposit}€
                </Text>
              </View>
            </>
          )}
        </View>

        {isPaid ? (
          <View style={styles.paidBanner}>
            <CheckCircle size={22} color={TEAL} strokeWidth={2} />
            <Text style={styles.paidText}>
              {rental.status === 'completed' ? 'Alquiler completado' : 'Pago realizado correctamente'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              Serás redirigido a Stripe para completar el pago de forma segura. Al finalizar, vuelve a la app.
            </Text>
            <TouchableOpacity
              style={[styles.payBtn, paying && styles.payBtnDisabled]}
              onPress={handlePay}
              disabled={paying}
              activeOpacity={0.85}
            >
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <CreditCard size={18} color="#fff" strokeWidth={2} />
                  <Text style={styles.payBtnText}>Pagar ahora</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, color: '#9ca3af' },
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
  content: { padding: 20 },
  summaryCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 18,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  productTitle: { fontSize: 16, fontWeight: '700', color: '#111827', lineHeight: 22, marginBottom: 4 },
  summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: '#6b7280' },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  summaryPrice: { color: TEAL },
  summaryTotal: { fontSize: 16, fontWeight: '800', color: '#111827' },
  hint: { fontSize: 13, color: '#6b7280', lineHeight: 19, marginBottom: 20, textAlign: 'center' },
  payBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  paidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f0faf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 14,
    padding: 16,
  },
  paidText: { fontSize: 15, fontWeight: '600', color: TEAL },
});
