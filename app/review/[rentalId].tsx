import { useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, Star, CheckCircle, AlertCircle, Info } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';
import CustomAlert, { type AlertButton, type CustomAlertProps } from '../../components/CustomAlert';

const TEAL = '#4b9c78';

type RentalData = {
  productTitle: string;
  ownerId: string;
  ownerName: string | null;
  renterId: string;
  renterName: string | null;
};

export default function ReviewScreen() {
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const [rental, setRental] = useState<RentalData | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [alertCfg, setAlertCfg] = useState<CustomAlertProps>({ visible: false, icon: null, iconBg: '#f0faf5', title: '', message: '', buttons: [] });
  function showAlert(icon: ReactNode, iconBg: string, title: string, message: string, buttons: AlertButton[]) { setAlertCfg({ visible: true, icon, iconBg, title, message, buttons }); }
  function hideAlert() { setAlertCfg((p) => ({ ...p, visible: false })); }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/(auth)/login'); return; }
      setUid(user.uid);
      try {
        const [rentalSnap, reviewSnap] = await Promise.all([
          getDoc(doc(db, 'rentals', rentalId)),
          getDocs(query(
            collection(db, 'reviews'),
            where('rentalId', '==', rentalId),
            where('reviewerId', '==', user.uid),
          )),
        ]);
        if (!rentalSnap.exists()) {
          showAlert(<AlertCircle size={32} color="#ef4444" strokeWidth={2} />, '#fef2f2', 'Error', 'Alquiler no encontrado.', [{ text: 'OK', onPress: () => { hideAlert(); router.back(); } }]);
          return;
        }
        setRental(rentalSnap.data() as RentalData);
        if (!reviewSnap.empty) setAlreadyReviewed(true);
      } catch (e) {
        console.error('Error loading rental:', e);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [rentalId]);

  async function handleSubmit() {
    if (rating === 0) { showAlert(<Info size={32} color="#f97316" strokeWidth={2} />, '#fff7ed', 'Selecciona una valoración', 'Elige entre 1 y 5 estrellas.', [{ text: 'OK', onPress: hideAlert }]); return; }
    if (!rental || !uid) return;

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      showAlert(<AlertCircle size={32} color="#ef4444" strokeWidth={2} />, '#fef2f2', 'Error', 'No estás autenticado. Vuelve a iniciar sesión.', [{ text: 'OK', onPress: hideAlert }]);
      return;
    }

    const isRenter = uid === rental.renterId;
    const reviewedId = isRenter ? rental.ownerId : rental.renterId;
    const reviewedName = isRenter ? (rental.ownerName ?? 'Usuario') : (rental.renterName ?? 'Usuario');
    const ratingField = isRenter ? 'ratingsAsOwner' : 'ratingsAsRenter';

    setSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('No autenticado');

      await addDoc(collection(db, 'reviews'), {
        rentalId,
        reviewerId: currentUser.uid,
        reviewedId,
        reviewedName,
        rating,
        comment: comment.trim(),
        createdAt: Timestamp.now(),
      });

      // Atomically update the reviewed user's rating stats
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', reviewedId);
        const userSnap = await tx.get(userRef);
        const existing = userSnap.data()?.[ratingField] ?? { total: 0, count: 0, average: 0 };
        const newTotal = (existing.total ?? 0) + rating;
        const newCount = (existing.count ?? 0) + 1;
        tx.set(userRef, {
          [ratingField]: { total: newTotal, count: newCount, average: newTotal / newCount },
        }, { merge: true });
      });

      showAlert(<CheckCircle size={32} color="#4b9c78" strokeWidth={2} />, '#f0faf5', '¡Gracias!', 'Tu valoración ha sido enviada.', [{ text: 'OK', onPress: () => { hideAlert(); router.back(); } }]);
    } catch (e: any) {
      console.error('[Review] error:', e);
      showAlert(<AlertCircle size={32} color="#ef4444" strokeWidth={2} />, '#fef2f2', 'Error', e.message ?? 'No se pudo enviar la valoración.', [{ text: 'OK', onPress: hideAlert }]);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <View style={styles.centered}><ActivityIndicator size="large" color={TEAL} /></View>
        <CustomAlert {...alertCfg} />
      </>
    );
  }

  if (alreadyReviewed) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.title}>Valoración</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.alreadyText}>Ya has valorado este alquiler.</Text>
        </View>
        <CustomAlert {...alertCfg} />
      </View>
    );
  }

  const isRenter = uid === rental?.renterId;
  const otherName = isRenter ? (rental?.ownerName ?? 'Usuario') : (rental?.renterName ?? 'Usuario');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Dejar valoración</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.productName} numberOfLines={2}>{rental?.productTitle}</Text>
        <Text style={styles.otherUser}>Valorando a <Text style={styles.otherUserBold}>{otherName}</Text></Text>

        <View style={styles.divider} />

        {/* Star picker */}
        <Text style={styles.sectionLabel}>Puntuación *</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7} hitSlop={4}>
              <Star
                size={38}
                color="#f59e0b"
                fill={n <= rating ? '#f59e0b' : 'transparent'}
                strokeWidth={1.5}
              />
            </TouchableOpacity>
          ))}
        </View>
        {rating > 0 && (
          <Text style={styles.ratingLabel}>
            {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][rating]}
          </Text>
        )}

        <View style={styles.divider} />

        {/* Comment */}
        <Text style={styles.sectionLabel}>Comentario <Text style={styles.optional}>(opcional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="Describe tu experiencia..."
          placeholderTextColor="#9ca3af"
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || rating === 0) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>Enviar valoración</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
      <CustomAlert {...alertCfg} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
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
  content: { padding: 24 },
  productName: { fontSize: 18, fontWeight: '700', color: '#111827', lineHeight: 24, marginBottom: 6 },
  otherUser: { fontSize: 14, color: '#6b7280' },
  otherUserBold: { fontWeight: '700', color: '#374151' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 22 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: '#374151',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 14,
  },
  optional: { fontSize: 12, fontWeight: '400', color: '#9ca3af', textTransform: 'none' },
  starsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  ratingLabel: { fontSize: 14, color: '#f59e0b', fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
    height: 110, marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: TEAL, borderRadius: 14, height: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  alreadyText: { fontSize: 15, color: '#9ca3af' },
});
