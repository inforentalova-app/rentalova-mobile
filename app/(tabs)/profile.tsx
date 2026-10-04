import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { ChevronRight, Package, Calendar, LogOut, Inbox, LayoutDashboard, Settings, AlertTriangle, Gift } from 'lucide-react-native';
import { auth, db } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          setVerificationStatus(snap.data()?.verificationStatus ?? null);
        } catch {
          setVerificationStatus(null);
        }
      } else {
        setVerificationStatus(null);
      }
    });
    return unsub;
  }, []);

  function initials(name: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }

  async function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Perfil</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={8}>
          <Settings size={22} color="#6b7280" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Avatar + user info */}
      <View style={[styles.userSection, { borderBottomColor: colors.border }]}>
        {user?.photoURL ? (
          <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user?.displayName ?? null)}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]}>{user?.displayName ?? 'Usuario'}</Text>
          <Text style={[styles.userEmail, { color: colors.textLight }]}>{user?.email ?? ''}</Text>
        </View>
      </View>

      {/* Verification banner */}
      {verificationStatus !== 'verified' && (
        <TouchableOpacity
          style={styles.verificationBanner}
          onPress={() => router.push('/verification')}
          activeOpacity={0.8}
        >
          <AlertTriangle size={18} color="#92400e" strokeWidth={2} />
          <Text style={styles.verificationBannerText}>
            {verificationStatus === 'pending'
              ? 'Verificación en proceso…'
              : 'Verifica tu identidad para alquilar'}
          </Text>
          <ChevronRight size={16} color="#92400e" strokeWidth={2} />
        </TouchableOpacity>
      )}

      {/* Dashboard shortcut */}
      <TouchableOpacity
        style={[styles.dashboardBtn, { borderColor: colors.border }]}
        activeOpacity={0.75}
        onPress={() => router.push('/dashboard')}
      >
        <View style={styles.menuIconWrap}>
          <LayoutDashboard size={18} color={TEAL} strokeWidth={2} />
        </View>
        <Text style={[styles.menuText, { fontWeight: '600', color: colors.text }]}>Panel de control</Text>
        <ChevronRight size={16} color="#9ca3af" strokeWidth={2} />
      </TouchableOpacity>

      {/* Menu sections */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Mi actividad</Text>

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/my-rentals')}>
          <View style={styles.menuIconWrap}>
            <Calendar size={18} color={TEAL} strokeWidth={2} />
          </View>
          <Text style={[styles.menuText, { color: colors.text }]}>Mis alquileres</Text>
          <ChevronRight size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/my-products')}>
          <View style={styles.menuIconWrap}>
            <Package size={18} color={TEAL} strokeWidth={2} />
          </View>
          <Text style={[styles.menuText, { color: colors.text }]}>Mis productos</Text>
          <ChevronRight size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/requests')}>
          <View style={styles.menuIconWrap}>
            <Inbox size={18} color={TEAL} strokeWidth={2} />
          </View>
          <Text style={[styles.menuText, { color: colors.text }]}>Solicitudes recibidas</Text>
          <ChevronRight size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/referral')}>
          <View style={styles.menuIconWrap}>
            <Gift size={18} color={TEAL} strokeWidth={2} />
          </View>
          <Text style={[styles.menuText, { color: colors.text }]}>Invitar amigos</Text>
          <ChevronRight size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
        <LogOut size={18} color="#ef4444" strokeWidth={2} />
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f0faf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  itemDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 60,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 15,
    color: '#ef4444',
    fontWeight: '600',
  },
  verificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: '#fef9c3',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  verificationBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: '#f0faf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
