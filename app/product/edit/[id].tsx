import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { X, ChevronDown, ImagePlus, ChevronLeft } from 'lucide-react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { db, storage, auth } from '../../../lib/firebase';

const TEAL = '#4b9c78';

const CATEGORIES = [
  'Herramientas', 'Camping', 'Electrónica', 'Deporte', 'Hogar y jardín',
  'Fotografía y vídeo', 'Audio y música', 'Transporte', 'Bebé y niños',
  'Bricolaje y construcción', 'Cocina y hostelería', 'Ropa y moda',
  'Juegos y consolas', 'Libros y educación', 'Mascotas', 'Oficina y papelería', 'Otros',
];

const ZONES = [
  'Centro', 'Arganzuela', 'Retiro', 'Salamanca', 'Chamartín', 'Tetuán', 'Chamberí',
  'Fuencarral', 'Moncloa', 'Latina', 'Carabanchel', 'Usera', 'Puente de Vallecas',
  'Moratalaz', 'Ciudad Lineal', 'Hortaleza', 'Villaverde', 'Villa de Vallecas',
  'Vicálvaro', 'San Blas', 'Barajas', 'Alcobendas', 'Getafe', 'Leganés',
  'Móstoles', 'Alcorcón', 'Pozuelo',
];

function isLocalUri(uri: string) {
  return !uri.startsWith('http');
}

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [pricePerWeek, setPricePerWeek] = useState('');
  const [pricePerMonth, setPricePerMonth] = useState('');
  const [deposit, setDeposit] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [categoryModal, setCategoryModal] = useState(false);
  const [zoneModal, setZoneModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'products', id));
        if (!snap.exists()) { Alert.alert('Error', 'Producto no encontrado.'); router.back(); return; }
        const data = snap.data();

        // Ownership check deferred to render — uid might not be ready yet
        setTitle(data.title ?? '');
        setDescription(data.description ?? '');
        setCategory(data.category ?? '');
        setPricePerDay(data.pricePerDay != null ? String(data.pricePerDay) : '');
        setPricePerWeek(data.pricePerWeek != null ? String(data.pricePerWeek) : '');
        setPricePerMonth(data.pricePerMonth != null ? String(data.pricePerMonth) : '');
        setDeposit(data.deposit != null ? String(data.deposit) : '');
        setLocation(data.location ?? '');
        setPhotos(data.photos ?? []);
      } catch (e) {
        console.error('Error loading product:', e);
      } finally {
        setLoadingProduct(false);
      }
    }
    load();
  }, [id]);

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería.'); return; }
    const remaining = 5 - photos.length;
    if (remaining <= 0) { Alert.alert('Límite alcanzado', 'Máximo 5 fotos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
    }
  }

  async function uploadPhoto(uri: string, userId: string): Promise<string> {
    const filename = uri.split('/').pop() ?? 'photo.jpg';
    const storageRef = ref(storage, `products/${userId}/${Date.now()}_${filename}`);
    const blob = await (await fetch(uri)).blob();
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  }

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Campo requerido', 'Añade un título.'); return; }
    if (!category) { Alert.alert('Campo requerido', 'Selecciona una categoría.'); return; }
    if (!pricePerDay || isNaN(Number(pricePerDay))) { Alert.alert('Campo requerido', 'Precio por día inválido.'); return; }
    if (!location) { Alert.alert('Campo requerido', 'Selecciona una zona.'); return; }
    if (photos.length === 0) { Alert.alert('Fotos requeridas', 'Añade al menos una foto.'); return; }
    if (!uid) return;

    setSaving(true);
    try {
      const finalPhotos = await Promise.all(
        photos.map((uri) => isLocalUri(uri) ? uploadPhoto(uri, uid) : Promise.resolve(uri)),
      );
      await updateDoc(doc(db, 'products', id), {
        title: title.trim(),
        description: description.trim(),
        category,
        pricePerDay: Number(pricePerDay),
        ...(pricePerWeek ? { pricePerWeek: Number(pricePerWeek) } : { pricePerWeek: null }),
        ...(pricePerMonth ? { pricePerMonth: Number(pricePerMonth) } : { pricePerMonth: null }),
        ...(deposit ? { deposit: Number(deposit) } : { deposit: null }),
        location,
        photos: finalPhotos,
      });
      Alert.alert('Guardado', 'Los cambios se han guardado correctamente.', [
        { text: 'OK', onPress: () => router.replace('/my-products') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  function handlePause() {
    Alert.alert('Pausar producto', '¿Quieres pausar este producto? No aparecerá en los resultados de búsqueda.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Pausar',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'products', id), { status: 'paused' });
            router.replace('/my-products');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  function handleDelete() {
    Alert.alert(
      'Eliminar producto',
      '¿Seguro que quieres eliminar este producto? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'products', id), { status: 'deleted' });
              router.replace('/my-products');
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  }

  if (loadingProduct) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Editar producto</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <Text style={styles.label}>Título *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle}
          placeholder="Ej. Taladro percutor Bosch" placeholderTextColor="#9ca3af" />

        <Text style={styles.label}>Descripción</Text>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
          placeholder="Describe el estado, características y condiciones de uso..."
          placeholderTextColor="#9ca3af" multiline numberOfLines={4} textAlignVertical="top" />

        <Text style={styles.label}>Categoría *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setCategoryModal(true)} activeOpacity={0.7}>
          <Text style={[styles.selectText, !category && styles.placeholder]}>{category || 'Seleccionar categoría'}</Text>
          <ChevronDown size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        <Text style={styles.label}>Precio por día (€) *</Text>
        <TextInput style={styles.input} value={pricePerDay} onChangeText={setPricePerDay}
          placeholder="0" placeholderTextColor="#9ca3af" keyboardType="numeric" />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Precio por semana (€)</Text>
            <TextInput style={styles.input} value={pricePerWeek} onChangeText={setPricePerWeek}
              placeholder="Opcional" placeholderTextColor="#9ca3af" keyboardType="numeric" />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Precio por mes (€)</Text>
            <TextInput style={styles.input} value={pricePerMonth} onChangeText={setPricePerMonth}
              placeholder="Opcional" placeholderTextColor="#9ca3af" keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Fianza (€)</Text>
        <TextInput style={styles.input} value={deposit} onChangeText={setDeposit}
          placeholder="Opcional" placeholderTextColor="#9ca3af" keyboardType="numeric" />

        <Text style={styles.label}>Zona *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setZoneModal(true)} activeOpacity={0.7}>
          <Text style={[styles.selectText, !location && styles.placeholder]}>{location || 'Seleccionar zona'}</Text>
          <ChevronDown size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        <Text style={styles.label}>Fotos * <Text style={styles.labelHint}>(máx. 5)</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
              <TouchableOpacity style={styles.removePhoto} onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))} hitSlop={4}>
                <X size={12} color="#fff" strokeWidth={3} />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <TouchableOpacity style={styles.addPhotoButton} onPress={pickImages} activeOpacity={0.7}>
              <ImagePlus size={24} color={TEAL} strokeWidth={1.5} />
              <Text style={styles.addPhotoText}>Añadir{'\n'}fotos</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.btnDisabled]}
          onPress={handleSave} disabled={saving} activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
        </TouchableOpacity>

        {/* Pause */}
        <TouchableOpacity style={styles.pauseButton} onPress={handlePause} activeOpacity={0.8}>
          <Text style={styles.pauseButtonText}>Pausar producto</Text>
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.8}>
          <Text style={styles.deleteButtonText}>Eliminar producto</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Category modal */}
      <Modal visible={categoryModal} transparent animationType="fade" onRequestClose={() => setCategoryModal(false)}>
        <TouchableWithoutFeedback onPress={() => setCategoryModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Categoría</Text>
                <FlatList data={CATEGORIES} keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalOption, item === category && styles.modalOptionActive]}
                      onPress={() => { setCategory(item); setCategoryModal(false); }} activeOpacity={0.7}
                    >
                      <Text style={[styles.modalOptionText, item === category && styles.modalOptionTextActive]}>{item}</Text>
                      {item === category && <Text style={styles.check}>✓</Text>}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Zone modal */}
      <Modal visible={zoneModal} transparent animationType="fade" onRequestClose={() => setZoneModal(false)}>
        <TouchableWithoutFeedback onPress={() => setZoneModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Zona</Text>
                <FlatList data={ZONES} keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalOption, item === location && styles.modalOptionActive]}
                      onPress={() => { setLocation(item); setZoneModal(false); }} activeOpacity={0.7}
                    >
                      <Text style={[styles.modalOptionText, item === location && styles.modalOptionTextActive]}>{item}</Text>
                      {item === location && <Text style={styles.check}>✓</Text>}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
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
  form: { paddingHorizontal: 24, paddingTop: 24 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  labelHint: { fontSize: 12, fontWeight: '400', color: '#9ca3af', textTransform: 'none' },
  input: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827', marginBottom: 18,
  },
  multiline: { height: 100, paddingTop: 12 },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 18,
  },
  selectText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  placeholder: { color: '#9ca3af', fontWeight: '400' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  photosRow: { gap: 10, paddingRight: 4, marginBottom: 24 },
  photoThumb: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  thumbImage: { width: '100%', height: '100%' },
  removePhoto: {
    position: 'absolute', top: 5, right: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 3,
  },
  addPhotoButton: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 2, borderColor: '#d1fae5', borderStyle: 'dashed',
    backgroundColor: '#f0faf5', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11, color: TEAL, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  saveButton: {
    backgroundColor: TEAL, borderRadius: 14, height: 54,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  pauseButton: {
    borderWidth: 1.5, borderColor: '#f59e0b', borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: '#fffbeb',
  },
  pauseButtonText: { color: '#b45309', fontSize: 15, fontWeight: '700' },
  deleteButton: {
    borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f5',
  },
  deleteButtonText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '75%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 24, marginBottom: 12 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalOptionActive: { backgroundColor: '#f0faf5' },
  modalOptionText: { fontSize: 15, color: '#374151' },
  modalOptionTextActive: { color: TEAL, fontWeight: '600' },
  check: { fontSize: 15, color: TEAL, fontWeight: '700' },
});
