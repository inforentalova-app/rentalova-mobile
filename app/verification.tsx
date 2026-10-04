import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  ChevronLeft,
  CheckCircle,
  Clock,
  XCircle,
  Camera,
  ImageIcon,
  ShieldCheck,
} from 'lucide-react-native';
import { auth, db, storage } from '../lib/firebase';

const TEAL = '#4b9c78';

type VerifStatus = 'pending' | 'verified' | 'rejected' | null;

async function uploadPhoto(uid: string, slot: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `verifications/${uid}/${slot}.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export default function VerificationScreen() {
  const [status, setStatus] = useState<VerifStatus>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  const [dniFront, setDniFront] = useState<string | null>(null);
  const [dniBack, setDniBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoadingStatus(false); return; }
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setStatus((snap.data()?.verificationStatus as VerifStatus) ?? null);
      } catch {
        // no user doc yet
      } finally {
        setLoadingStatus(false);
      }
    });
    return unsub;
  }, []);

  async function pickFromLibrary(setFn: (uri: string) => void) {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setFn(result.assets[0].uri);
    }
  }

  async function takeSelfie() {
    const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a tu cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelfie(result.assets[0].uri);
    }
  }

  async function handleSubmit() {
    if (!uid) return;
    if (!dniFront || !dniBack || !selfie) {
      Alert.alert('Fotos requeridas', 'Debes subir las dos caras del DNI y un selfie.');
      return;
    }
    setUploading(true);
    try {
      const [frontUrl, backUrl, selfieUrl] = await Promise.all([
        uploadPhoto(uid, 'dni_front', dniFront),
        uploadPhoto(uid, 'dni_back', dniBack),
        uploadPhoto(uid, 'selfie', selfie),
      ]);
      await updateDoc(doc(db, 'users', uid), {
        verificationStatus: 'pending',
        verificationDocs: { dniFront: frontUrl, dniBack: backUrl, selfie: selfieUrl },
        verificationSubmittedAt: new Date().toISOString(),
      });
      setStatus('pending');
    } catch (e) {
      Alert.alert('Error', 'No se pudo enviar la verificación. Inténtalo de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  if (loadingStatus) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Verificación de identidad</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Current status banner */}
        {status === 'verified' && (
          <View style={[styles.statusBanner, styles.statusVerified]}>
            <CheckCircle size={22} color="#15803d" strokeWidth={2} />
            <Text style={[styles.statusText, { color: '#15803d' }]}>Identidad verificada</Text>
          </View>
        )}
        {status === 'pending' && (
          <View style={[styles.statusBanner, styles.statusPending]}>
            <Clock size={22} color="#92400e" strokeWidth={2} />
            <Text style={[styles.statusText, { color: '#92400e' }]}>Verificación en proceso — revisaremos tu solicitud en 24–48 h</Text>
          </View>
        )}
        {status === 'rejected' && (
          <View style={[styles.statusBanner, styles.statusRejected]}>
            <XCircle size={22} color="#991b1b" strokeWidth={2} />
            <Text style={[styles.statusText, { color: '#991b1b' }]}>Verificación rechazada. Vuelve a enviar tus documentos.</Text>
          </View>
        )}

        {/* Explanation */}
        {status !== 'verified' && status !== 'pending' && (
          <>
            <View style={styles.explainBox}>
              <ShieldCheck size={28} color={TEAL} strokeWidth={1.5} />
              <View style={{ flex: 1 }}>
                <Text style={styles.explainTitle}>¿Por qué verificar tu identidad?</Text>
                <Text style={styles.explainText}>
                  Rentalova verifica la identidad de todos los usuarios para garantizar transacciones seguras,
                  proteger a propietarios y arrendatarios, y cumplir con la normativa vigente.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>DOCUMENTOS NECESARIOS</Text>

            {/* DNI front */}
            <View style={styles.uploadRow}>
              <View style={styles.uploadInfo}>
                <Text style={styles.uploadLabel}>DNI — anverso</Text>
                <Text style={styles.uploadHint}>Cara con foto y nombre</Text>
              </View>
              {dniFront ? (
                <TouchableOpacity onPress={() => pickFromLibrary(setDniFront)} activeOpacity={0.8}>
                  <Image source={{ uri: dniFront }} style={styles.thumb} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickFromLibrary(setDniFront)}
                  activeOpacity={0.8}
                >
                  <ImageIcon size={18} color={TEAL} strokeWidth={2} />
                  <Text style={styles.uploadBtnText}>Subir foto</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            {/* DNI back */}
            <View style={styles.uploadRow}>
              <View style={styles.uploadInfo}>
                <Text style={styles.uploadLabel}>DNI — reverso</Text>
                <Text style={styles.uploadHint}>Cara con código MRZ</Text>
              </View>
              {dniBack ? (
                <TouchableOpacity onPress={() => pickFromLibrary(setDniBack)} activeOpacity={0.8}>
                  <Image source={{ uri: dniBack }} style={styles.thumb} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickFromLibrary(setDniBack)}
                  activeOpacity={0.8}
                >
                  <ImageIcon size={18} color={TEAL} strokeWidth={2} />
                  <Text style={styles.uploadBtnText}>Subir foto</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            {/* Selfie */}
            <View style={styles.uploadRow}>
              <View style={styles.uploadInfo}>
                <Text style={styles.uploadLabel}>Selfie</Text>
                <Text style={styles.uploadHint}>Foto tuya con cara visible</Text>
              </View>
              {selfie ? (
                <TouchableOpacity onPress={takeSelfie} activeOpacity={0.8}>
                  <Image source={{ uri: selfie }} style={styles.thumb} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={takeSelfie}
                  activeOpacity={0.8}
                >
                  <Camera size={18} color={TEAL} strokeWidth={2} />
                  <Text style={styles.uploadBtnText}>Cámara</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.privacyNote}>
              Tus documentos se almacenan de forma segura y solo son accesibles por el equipo de Rentalova para el proceso de verificación.
            </Text>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!dniFront || !dniBack || !selfie || uploading) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!dniFront || !dniBack || !selfie || uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Enviar verificación</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {status === 'verified' && (
          <View style={styles.verifiedContent}>
            <CheckCircle size={64} color={TEAL} strokeWidth={1.5} />
            <Text style={styles.verifiedTitle}>¡Todo listo!</Text>
            <Text style={styles.verifiedSubtitle}>Tu identidad está verificada. Ya puedes alquilar productos en Rentalova.</Text>
          </View>
        )}

        {status === 'pending' && (
          <View style={styles.verifiedContent}>
            <Clock size={64} color="#f59e0b" strokeWidth={1.5} />
            <Text style={styles.verifiedTitle}>En revisión</Text>
            <Text style={styles.verifiedSubtitle}>Estamos revisando tu documentación. Te avisaremos cuando esté lista (24–48 h).</Text>
          </View>
        )}

      </ScrollView>
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

  scrollContent: { padding: 24, paddingBottom: 48 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  statusVerified: { backgroundColor: '#dcfce7' },
  statusPending: { backgroundColor: '#fef9c3' },
  statusRejected: { backgroundColor: '#fee2e2' },
  statusText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },

  explainBox: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#f0faf5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
    alignItems: 'flex-start',
  },
  explainTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  explainText: { fontSize: 13, color: '#6b7280', lineHeight: 20 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  uploadInfo: { flex: 1 },
  uploadLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  uploadHint: { fontSize: 12, color: '#9ca3af' },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: TEAL,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  uploadBtnText: { fontSize: 13, fontWeight: '600', color: TEAL },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: TEAL,
  },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 16 },

  privacyNote: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 24,
  },

  submitBtn: {
    backgroundColor: TEAL,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  verifiedContent: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 16,
  },
  verifiedTitle: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  verifiedSubtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
});
