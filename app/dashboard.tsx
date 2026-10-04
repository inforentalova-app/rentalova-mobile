import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { BarChart } from 'react-native-chart-kit';
import {
  ChevronLeft,
  Package,
  Inbox,
  Calendar,
  MessageCircle,
  Wallet,
  TrendingUp,
  ShoppingBag,
  Euro,
  Star,
  ThumbsUp,
} from 'lucide-react-native';
import { db, auth } from '../lib/firebase';
import { useTheme } from '../hooks/useTheme';

const TEAL = '#4b9c78';
const SCREEN_W = Dimensions.get('window').width;

type RenterStats = {
  totalRentals: number;
  totalSpent: number;
  mostRentedProduct: string;
  avgRating: number | null;
};

type OwnerStats = {
  totalRentals: number;
  totalEarnings: number;
  mostPopularProduct: string;
  avgRating: number | null;
  acceptanceRate: number | null;
};

type MonthEntry = { label: string; year: number; month: number; spending: number; earnings: number };

function lastSixMonths(): MonthEntry[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: d.toLocaleDateString('es-ES', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
      spending: 0,
      earnings: 0,
    };
  });
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function mostCommon(arr: string[]): string {
  if (!arr.length) return '—';
  const counts: Record<string, number> = {};
  arr.forEach((v) => { counts[v] = (counts[v] ?? 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export default function DashboardScreen() {
  const [renter, setRenter] = useState<RenterStats | null>(null);
  const [owner, setOwner] = useState<OwnerStats | null>(null);
  const [months, setMonths] = useState<MonthEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'earnings' | 'spending'>('earnings');
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const [renterSnap, ownerSnap, userSnap] = await Promise.all([
          getDocs(query(collection(db, 'rentals'), where('renterId', '==', user.uid))),
          getDocs(query(collection(db, 'rentals'), where('ownerId', '==', user.uid))),
          getDoc(doc(db, 'users', user.uid)),
        ]);

        const userData = userSnap.data() ?? {};
        const monthBuckets = lastSixMonths();

        // ── Renter ──
        const renterDocs = renterSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const completedRenter = renterDocs.filter((r) => r.status === 'completed');
        const totalSpent = completedRenter.reduce((s: number, r: any) => s + (r.totalPrice ?? 0), 0);

        completedRenter.forEach((r: any) => {
          const d = tsToDate(r.createdAt ?? r.startDate);
          if (!d) return;
          const bucket = monthBuckets.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
          if (bucket) bucket.spending += r.totalPrice ?? 0;
        });

        setRenter({
          totalRentals: renterDocs.length,
          totalSpent,
          mostRentedProduct: mostCommon(renterDocs.map((r: any) => r.productTitle).filter(Boolean)),
          avgRating: userData.ratingsAsRenter?.count > 0 ? (userData.ratingsAsRenter.average as number) : null,
        });

        // ── Owner ──
        const ownerDocs = ownerSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const completedOwner = ownerDocs.filter((r: any) => r.status === 'completed');
        const totalEarnings = completedOwner.reduce((s: number, r: any) => s + (r.totalPrice ?? 0) * 0.8, 0);

        completedOwner.forEach((r: any) => {
          const d = tsToDate(r.createdAt ?? r.startDate);
          if (!d) return;
          const bucket = monthBuckets.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
          if (bucket) bucket.earnings += (r.totalPrice ?? 0) * 0.8;
        });

        const decided = ownerDocs.filter((r: any) => r.status !== 'pending');
        const accepted = decided.filter((r: any) => r.status !== 'rejected' && r.status !== 'cancelled');

        setOwner({
          totalRentals: ownerDocs.length,
          totalEarnings,
          mostPopularProduct: mostCommon(ownerDocs.map((r: any) => r.productTitle).filter(Boolean)),
          avgRating: userData.ratingsAsOwner?.count > 0 ? (userData.ratingsAsOwner.average as number) : null,
          acceptanceRate: decided.length > 0 ? (accepted.length / decided.length) * 100 : null,
        });

        setMonths(monthBuckets);
      } catch (e) {
        console.error('Error loading dashboard:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const quickActions = [
    { label: 'Mis productos',  icon: Package,       route: '/my-products' },
    { label: 'Solicitudes',    icon: Inbox,         route: '/requests' },
    { label: 'Mis alquileres', icon: Calendar,      route: '/my-rentals' },
    { label: 'Mensajes',       icon: MessageCircle, route: '/(tabs)/messages' },
    { label: 'Monedero',       icon: Wallet,        route: '/wallet' },
  ] as const;

  const chartValues = months.map((m) => chartMode === 'earnings' ? m.earnings : m.spending);
  const hasData = chartValues.some((v) => v > 0);
  const chartData = {
    labels: months.map((m) => m.label),
    datasets: [{ data: chartValues.map((v) => Math.max(v, 0.01)) }],
  };
  const chartConfig = {
    backgroundColor: colors.card,
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(75, 156, 120, ${opacity})`,
    labelColor: (opacity = 1) => isDark
      ? `rgba(148,163,184,${opacity})`
      : `rgba(107,114,128,${opacity})`,
    barPercentage: 0.55,
    propsForBackgroundLines: {
      strokeWidth: 1,
      stroke: isDark ? '#334155' : '#f3f4f6',
    },
  };

  const fmtEur = (n: number) => `${Math.round(n)}€`;
  const fmtStar = (n: number | null) => n !== null ? `${n.toFixed(1)} ★` : '—';
  const fmtRate = (n: number | null) => n !== null ? `${Math.round(n)}%` : '—';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Panel de control</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── Como arrendatario ── */}
          <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Como arrendatario</Text>
          <View style={styles.grid}>
            <StatCard icon={<Calendar size={18} color={TEAL} strokeWidth={2} />}
              label="Alquileres realizados" value={renter?.totalRentals ?? 0} colors={colors} />
            <StatCard icon={<Euro size={18} color="#6366f1" strokeWidth={2} />}
              label="Dinero gastado" value={fmtEur(renter?.totalSpent ?? 0)} accent="#6366f1" colors={colors} />
            <StatCard icon={<ShoppingBag size={18} color="#f59e0b" strokeWidth={2} />}
              label="Más alquilado" value={renter?.mostRentedProduct ?? '—'} accent="#f59e0b" small colors={colors} />
            <StatCard icon={<Star size={18} color="#f59e0b" strokeWidth={2} />}
              label="Valoración recibida" value={fmtStar(renter?.avgRating ?? null)} accent="#f59e0b" colors={colors} />
          </View>

          {/* ── Como propietario ── */}
          <Text style={[styles.sectionLabel, { color: colors.textLight, marginTop: 28 }]}>Como propietario</Text>
          <View style={styles.grid}>
            <StatCard icon={<Inbox size={18} color={TEAL} strokeWidth={2} />}
              label="Alquileres recibidos" value={owner?.totalRentals ?? 0} colors={colors} />
            <StatCard icon={<TrendingUp size={18} color="#10b981" strokeWidth={2} />}
              label="Ingresos netos (−20%)" value={fmtEur(owner?.totalEarnings ?? 0)} accent="#10b981" colors={colors} />
            <StatCard icon={<Package size={18} color="#8b5cf6" strokeWidth={2} />}
              label="Producto popular" value={owner?.mostPopularProduct ?? '—'} accent="#8b5cf6" small colors={colors} />
            <StatCard icon={<Star size={18} color="#f59e0b" strokeWidth={2} />}
              label="Valoración recibida" value={fmtStar(owner?.avgRating ?? null)} accent="#f59e0b" colors={colors} />
            <StatCard icon={<ThumbsUp size={18} color="#3b82f6" strokeWidth={2} />}
              label="Tasa de aceptación" value={fmtRate(owner?.acceptanceRate ?? null)} accent="#3b82f6" wide colors={colors} />
          </View>

          {/* ── Gráfico ── */}
          <Text style={[styles.sectionLabel, { color: colors.textLight, marginTop: 28 }]}>Evolución · últimos 6 meses</Text>
          <View style={[styles.chartBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.toggle, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
              {(['earnings', 'spending'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.toggleBtn, chartMode === mode && styles.toggleBtnOn]}
                  onPress={() => setChartMode(mode)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.toggleTxt, { color: colors.textLight }, chartMode === mode && styles.toggleTxtOn]}>
                    {mode === 'earnings' ? 'Ingresos' : 'Gastos'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!hasData ? (
              <View style={styles.chartEmpty}>
                <TrendingUp size={32} color={colors.textLight} strokeWidth={1.5} />
                <Text style={[styles.chartEmptyTxt, { color: colors.textLight }]}>
                  Aún no hay datos para mostrar
                </Text>
              </View>
            ) : (
              <BarChart
                data={chartData}
                width={SCREEN_W - 72}
                height={180}
                yAxisLabel=""
                yAxisSuffix="€"
                chartConfig={chartConfig}
                style={styles.chart}
                showValuesOnTopOfBars
                fromZero
                withInnerLines
              />
            )}
          </View>

          {/* ── Accesos rápidos ── */}
          <Text style={[styles.sectionLabel, { color: colors.textLight, marginTop: 28 }]}>Accesos rápidos</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map(({ label, icon: Icon, route }) => (
              <TouchableOpacity
                key={route}
                style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => router.push(route as any)}
              >
                <View style={styles.actionIconWrap}>
                  <Icon size={22} color={TEAL} strokeWidth={2} />
                </View>
                <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent?: string;
  small?: boolean;
  wide?: boolean;
  colors: any;
};

function StatCard({ icon, label, value, accent = TEAL, small, wide, colors }: StatCardProps) {
  return (
    <View style={[
      statS.card,
      { backgroundColor: colors.background, borderColor: colors.border },
      wide && statS.wide,
    ]}>
      <View style={[statS.iconWrap, { backgroundColor: accent + '18' }]}>{icon}</View>
      <Text style={[statS.value, { color: colors.text }, small && statS.valueSmall]} numberOfLines={2}>
        {String(value)}
      </Text>
      <Text style={[statS.label, { color: colors.textLight }]}>{label}</Text>
    </View>
  );
}

const statS = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  wide: { minWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, marginBottom: 2 },
  valueSmall: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
});

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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chartBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    gap: 2,
  },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleBtnOn: { backgroundColor: TEAL },
  toggleTxt: { fontSize: 13, fontWeight: '600' },
  toggleTxtOn: { color: '#fff' },
  chart: { borderRadius: 10, marginLeft: -8 },
  chartEmpty: { height: 140, alignItems: 'center', justifyContent: 'center', gap: 12 },
  chartEmptyTxt: { fontSize: 14, fontWeight: '500' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 10,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0faf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
});
