import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { router } from 'expo-router';
import {
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react-native';
import { auth, db, storage } from '../lib/firebase';
import { useTheme, setThemePreference } from '../hooks/useTheme';
import type { ThemePreference } from '../lib/theme';

type RentalPreference = 'rent_only' | 'lend_only' | 'both';

const TEAL = '#4b9c78';

export default function SettingsScreen() {
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingNotif, setSavingNotif] = useState(false);

  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const [rentalPreference, setRentalPreference] = useState<RentalPreference>('both');
  const [profilePublic, setProfilePublic] = useState(true);
  const [allowMessages, setAllowMessages] = useState(true);

  const [isEmailProvider, setIsEmailProvider] = useState(false);
  const [loading, setLoading] = useState(true);

  const { colors, preference: themePreference } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/(auth)/login'); return; }
      setDisplayName(user.displayName ?? '');
      setPhotoURL(user.photoURL ?? null);
      const hasEmail = user.providerData.some((p) => p.providerId === 'password');
      setIsEmailProvider(hasEmail);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.notificationsEnabled !== undefined) {
            setNotificationsEnabled(!!data.notificationsEnabled);
          }
          if (data.rentalPreference) setRentalPreference(data.rentalPreference as RentalPreference);
          if (data.profilePublic !== undefined) setProfilePublic(!!data.profilePublic);
          if (data.allowMessages !== undefined) setAllowMessages(!!data.allowMessages);
        }
      } catch (e) {
        console.error('Error loading user settings:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function handleChangePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const user = auth.currentUser;
    if (!user) return;
    setSavingPhoto(true);
    try {
      const blob = await (await fetch(result.assets[0].uri)).blob();
      const sRef = storageRef(storage, `users/${user.uid}/profile.jpg`);
      await uploadBytes(sRef, blob);
      const url = await getDownloadURL(sRef);
      await updateProfile(user, { photoURL: url });
      await setDoc(doc(db, 'users', user.uid), { photoURL: url }, { merge: true });
      setPhotoURL(url);
      Alert.alert('Foto actualizada', 'Tu foto de perfil ha sido guardada.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo actualizar la foto.');
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleSaveName() {
    const trimmed = displayName.trim();
    if (!trimmed) { Alert.alert('Campo requerido', 'El nombre no puede estar vacío.'); return; }
    const user = auth.currentUser;
    if (!user) return;
    setSavingName(true);
    try {
      await updateProfile(user, { displayName: trimmed });
      await setDoc(doc(db, 'users', user.uid), { displayName: trimmed }, { merge: true });
      Alert.alert('Guardado', 'Tu nombre ha sido actualizado.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo actualizar el nombre.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      Alert.alert('Campos requeridos', 'Introduce la contraseña actual y la nueva.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Contraseña débil', 'La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    const user = auth.currentUser;
    if (!user || !user.email) return;
    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Contraseña cambiada', 'Tu contraseña ha sido actualizada correctamente.');
    } catch (e: any) {
      const msg = e.code === 'auth/wrong-password'
        ? 'La contraseña actual es incorrecta.'
        : (e.message ?? 'No se pudo cambiar la contraseña.');
      Alert.alert('Error', msg);
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleToggleNotifications(value: boolean) {
    setNotificationsEnabled(value);
    const user = auth.currentUser;
    if (!user) return;
    setSavingNotif(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { notificationsEnabled: value }, { merge: true });
    } catch (e) {
      console.error('Error saving notification preference:', e);
      setNotificationsEnabled(!value);
    } finally {
      setSavingNotif(false);
    }
  }

  async function handleRentalPreference(pref: RentalPreference) {
    setRentalPreference(pref);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { rentalPreference: pref }, { merge: true });
    } catch (e) {
      console.error('Error saving rental preference:', e);
    }
  }

  async function handleToggleProfilePublic(value: boolean) {
    setProfilePublic(value);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { profilePublic: value }, { merge: true });
    } catch (e) {
      console.error('Error saving profilePublic:', e);
      setProfilePublic(!value);
    }
  }

  async function handleToggleAllowMessages(value: boolean) {
    setAllowMessages(value);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { allowMessages: value }, { merge: true });
    } catch (e) {
      console.error('Error saving allowMessages:', e);
      setAllowMessages(!value);
    }
  }

  function handleSignOut() {
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

  function handleDeleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      '¿Seguro que quieres eliminar tu cuenta? Esta acción es irreversible y se perderán todos tus datos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, eliminar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmación final',
              'Esta acción eliminará permanentemente tu cuenta. ¿Confirmas?',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar definitivamente',
                  style: 'destructive',
                  onPress: async () => {
                    const user = auth.currentUser;
                    if (!user) return;
                    try {
                      await deleteUser(user);
                      router.replace('/(auth)/login');
                    } catch (e: any) {
                      if (e.code === 'auth/requires-recent-login') {
                        Alert.alert(
                          'Sesión expirada',
                          'Por seguridad, cierra sesión, vuelve a iniciarla y repite esta acción.',
                        );
                      } else {
                        Alert.alert('Error', e.message ?? 'No se pudo eliminar la cuenta.');
                      }
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TEAL} /></View>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Ajustes</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Mi cuenta ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Mi cuenta</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.photoRow}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.photoAvatar} />
            ) : (
              <View style={styles.photoAvatarPlaceholder} />
            )}
            <TouchableOpacity
              style={[styles.saveBtn, savingPhoto && styles.saveBtnDisabled]}
              onPress={handleChangePhoto}
              disabled={savingPhoto}
              activeOpacity={0.8}
            >
              {savingPhoto
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Cambiar foto</Text>
              }
            </TouchableOpacity>
          </View>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Nombre</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Tu nombre"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity
              style={[styles.saveBtn, savingName && styles.saveBtnDisabled]}
              onPress={handleSaveName}
              disabled={savingName}
              activeOpacity={0.8}
            >
              {savingName
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>

          {isEmailProvider && (
            <>
              <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Cambiar contraseña</Text>
              <TextInput
                style={[styles.input, { marginBottom: 10, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Contraseña actual"
                placeholderTextColor="#9ca3af"
                secureTextEntry
              />
              <TextInput
                style={[styles.input, { marginBottom: 12, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nueva contraseña (mín. 6 caracteres)"
                placeholderTextColor="#9ca3af"
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.saveBtn, styles.saveBtnFull, savingPassword && styles.saveBtnDisabled]}
                onPress={handleChangePassword}
                disabled={savingPassword}
                activeOpacity={0.8}
              >
                {savingPassword
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>Cambiar contraseña</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Notificaciones ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Notificaciones</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Notificaciones push</Text>
              <Text style={[styles.toggleSub, { color: colors.textLight }]}>Recibe avisos de nuevas solicitudes y mensajes</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#e5e7eb', true: '#d1fae5' }}
              thumbColor={notificationsEnabled ? TEAL : '#9ca3af'}
              disabled={savingNotif}
            />
          </View>
        </View>

        {/* ── Apariencia ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Apariencia</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((pref, idx, arr) => (
            <View key={pref}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setThemePreference(pref)}
                activeOpacity={0.7}
              >
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>
                    {pref === 'system' ? 'Seguir el sistema' : pref === 'light' ? 'Claro' : 'Oscuro'}
                  </Text>
                </View>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 2,
                  borderColor: themePreference === pref ? '#4b9c78' : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {themePreference === pref && (
                    <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#4b9c78' }} />
                  )}
                </View>
              </TouchableOpacity>
              {idx < arr.length - 1 && <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />}
            </View>
          ))}
        </View>

        {/* ── Preferencias de alquiler ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Preferencias de alquiler</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {([
            { value: 'rent_only', label: 'Solo alquilar' },
            { value: 'lend_only', label: 'Solo prestar' },
            { value: 'both',      label: 'Ambas cosas' },
          ] as { value: RentalPreference; label: string }[]).map(({ value, label }, idx, arr) => (
            <View key={value}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => handleRentalPreference(value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 2,
                  borderColor: rentalPreference === value ? TEAL : colors.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {rentalPreference === value && (
                    <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: TEAL }} />
                  )}
                </View>
              </TouchableOpacity>
              {idx < arr.length - 1 && <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />}
            </View>
          ))}
        </View>

        {/* ── Privacidad ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Privacidad</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Mostrar mi perfil públicamente</Text>
              <Text style={[styles.toggleSub, { color: colors.textLight }]}>Otros usuarios pueden ver tu perfil</Text>
            </View>
            <Switch
              value={profilePublic}
              onValueChange={handleToggleProfilePublic}
              trackColor={{ false: '#e5e7eb', true: '#d1fae5' }}
              thumbColor={profilePublic ? TEAL : '#9ca3af'}
            />
          </View>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={[styles.toggleLabel, { color: colors.text }]}>Permitir mensajes de desconocidos</Text>
              <Text style={[styles.toggleSub, { color: colors.textLight }]}>Cualquier usuario puede enviarte mensajes</Text>
            </View>
            <Switch
              value={allowMessages}
              onValueChange={handleToggleAllowMessages}
              trackColor={{ false: '#e5e7eb', true: '#d1fae5' }}
              thumbColor={allowMessages ? TEAL : '#9ca3af'}
            />
          </View>
        </View>

        {/* ── Métodos de pago ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Métodos de pago</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.rentalova.com/dashboard/wallet')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Gestionar métodos de pago</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ── Ayuda y soporte ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Ayuda y soporte</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.rentalova.com')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Centro de ayuda</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('mailto:support.rentalova@gmail.com')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Contactar con soporte</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('mailto:support.rentalova@gmail.com?subject=Reporte%20de%20problema')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Reportar un problema</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ── Sobre Rentalova ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Sobre Rentalova</Text>
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.linkRow, { paddingVertical: 6 }]}>
            <Text style={[styles.linkText, { color: colors.text }]}>Versión</Text>
            <Text style={[styles.versionText, { color: colors.textLight }]}>1.0.0</Text>
          </View>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.rentalova.com/legal/terminos')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Términos y condiciones</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.rentalova.com/legal/privacidad')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Política de privacidad</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://www.rentalova.com/legal/cookies')}
          >
            <Text style={[styles.linkText, { color: colors.text }]}>Política de cookies</Text>
            <ExternalLink size={15} color="#9ca3af" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ── Cuenta ── */}
        <Text style={[styles.sectionLabel, { color: colors.textLight }]}>Cuenta</Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.dangerBtnText}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dangerBtn, styles.deleteBtn]}
          onPress={handleDeleteAccount}
          activeOpacity={0.8}
        >
          <Text style={styles.dangerBtnText}>Eliminar cuenta</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
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
  title: { fontSize: 20, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  content: { padding: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10, marginTop: 6, marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 16,
    marginBottom: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  cardDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 14 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4 },
  photoAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e5e7eb' },
  photoAvatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e5e7eb' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: '#111827',
  },
  saveBtn: {
    backgroundColor: TEAL, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnFull: { alignSelf: 'flex-start', paddingHorizontal: 20 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  linkText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  versionText: { fontSize: 15, color: '#9ca3af' },
  dangerBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#ef4444',
    borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  deleteBtn: { borderColor: '#dc2626', backgroundColor: '#fff5f5' },
  dangerBtnText: { fontSize: 15, fontWeight: '700', color: '#ef4444' },
});
