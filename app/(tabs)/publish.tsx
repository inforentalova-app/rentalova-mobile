import { useState } from 'react';
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
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { X, ChevronDown, ImagePlus, MapPin, ChevronLeft } from 'lucide-react-native';
import { db, storage, auth } from '../../lib/firebase';

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

export default function PublishScreen() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [pricePerWeek, setPricePerWeek] = useState('');
  const [pricePerMonth, setPricePerMonth] = useState('');
  const [deposit, setDeposit] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [availableNow, setAvailableNow] = useState(true);

  const [categoryModal, setCategoryModal] = useState(false);
  const [zoneModal, setZoneModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tu galería para añadir fotos.');
      return;
    }
    const remaining = 5 - photos.length;
    if (remaining <= 0) { Alert.alert('Límite alcanzado', 'Puedes añadir un máximo de 5 fotos.'); return; }
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

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadPhoto(uri: string, userId: string): Promise<string> {
    const filename = uri.split('/').pop() ?? 'photo.jpg';
    const storageRef = ref(storage, `products/${userId}/${Date.now()}_${filename}`);
    const blob = await (await fetch(uri)).blob();
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  }

  function validate(): boolean {
    if (!title.trim()) { Alert.alert('Campo requerido', 'Añade un título al producto.'); return false; }
    if (!category) { Alert.alert('Campo requerido', 'Selecciona una categoría.'); return false; }
    if (!pricePerDay || isNaN(Number(pricePerDay))) { Alert.alert('Campo requerido', 'Introduce un precio por día válido.'); return false; }
    if (!estimatedValue || isNaN(Number(estimatedValue))) { Alert.alert('Campo requerido', 'Introduce el valor estimado del producto.'); return false; }
    if (!location) { Alert.alert('Campo requerido', 'Selecciona una zona.'); return false; }
    if (photos.length === 0) { Alert.alert('Fotos requeridas', 'Añade al menos una foto del producto.'); return false; }
    return true;
  }

  async function handleGenerateDescription() {
    if (!title.trim()) { Alert.alert('Campo requerido', 'Introduce primero el título del producto.'); return; }
    if (!category) { Alert.alert('Campo requerido', 'Selecciona primero la categoría.'); return; }
    setGeneratingDesc(true);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : null;
      const res = await fetch('https://www.rentalova.com/api/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ title: title.trim(), category }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as any).error ?? (errData as any).message ?? `Error del servidor (${res.status})`);
      }
      const data = await res.json();
      if (data.description) setDescription(data.description);
    } catch (e: any) {
      Alert.alert('Error al generar descripción', e.message ?? 'No se pudo generar la descripción.');
    } finally {
      setGeneratingDesc(false);
    }
  }

  async function handlePublish() {
    const user = auth.currentUser;
    if (!user) { router.replace('/(auth)/login'); return; }
    setLoading(true);
    try {
      const uploadedUrls = await Promise.all(photos.map((uri) => uploadPhoto(uri, user.uid)));
      await addDoc(collection(db, 'products'), {
        title: title.trim(),
        description: description.trim(),
        category,
        pricePerDay: Number(pricePerDay),
        ...(pricePerWeek ? { pricePerWeek: Number(pricePerWeek) } : {}),
        ...(pricePerMonth ? { pricePerMonth: Number(pricePerMonth) } : {}),
        ...(deposit ? { deposit: Number(deposit) } : {}),
        estimatedValue: Number(estimatedValue),
        location,
        photos: uploadedUrls,
        ownerId: user.uid,
        ownerName: user.displayName ?? null,
        status: availableNow ? 'active' : 'paused',
        createdAt: Timestamp.now(),
      });
      Alert.alert('¡Publicado!', 'Tu producto ya está disponible.', [
        { text: 'Ver mis productos', onPress: () => router.replace('/my-products') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo publicar el producto.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Preview screen ───────────────────────────────────────────────────────────
  if (showPreview) {
    return (
      <View style={styles.container}>
        <View style={styles.previewHeader}>
          <TouchableOpacity onPress={() => setShowPreview(false)} hitSlop={8} style={styles.previewBack}>
            <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.previewHeaderTitle}>Previsualización</Text>
          <TouchableOpacity onPress={() => setShowPreview(false)} activeOpacity={0.7}>
            <Text style={styles.editLink}>Editar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Photo */}
          {photos[0] ? (
            <Image source={{ uri: photos[0] }} style={styles.previewPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.previewPhotoPlaceholder} />
          )}

          <View style={styles.previewContent}>
            {/* Category */}
            {category ? (
              <View style={styles.previewCategoryBadge}>
                <Text style={styles.previewCategoryText}>{category}</Text>
              </View>
            ) : null}

            <Text style={styles.previewTitle}>{title}</Text>

            {location ? (
              <View style={styles.previewLocationRow}>
                <MapPin size={14} color="#9ca3af" strokeWidth={2} />
                <Text style={styles.previewLocationText}>{location}, Madrid</Text>
              </View>
            ) : null}

            {/* Prices */}
            <View style={styles.previewPriceSection}>
              <Text style={styles.previewPriceDay}>
                {pricePerDay}€<Text style={styles.previewPriceDayLabel}>/día</Text>
              </Text>
              <View style={styles.previewPriceBadges}>
                {pricePerWeek ? (
                  <View style={styles.previewPriceBadge}>
                    <Text style={styles.previewPriceBadgeText}>{pricePerWeek}€/semana</Text>
                  </View>
                ) : null}
                {pricePerMonth ? (
                  <View style={styles.previewPriceBadge}>
                    <Text style={styles.previewPriceBadgeText}>{pricePerMonth}€/mes</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.previewEstimatedValue}>Valor estimado: {estimatedValue}€</Text>
            </View>

            <View style={styles.previewDivider} />

            {/* Availability */}
            <View style={styles.previewAvailRow}>
              <View style={[styles.previewAvailBadge, !availableNow && styles.previewAvailBadgePaused]}>
                <Text style={[styles.previewAvailText, !availableNow && styles.previewAvailTextPaused]}>
                  {availableNow ? '● Disponible ahora' : '○ Se publicará como pausado'}
                </Text>
              </View>
              {deposit ? (
                <Text style={styles.previewDeposit}>Fianza: {deposit}€</Text>
              ) : null}
            </View>

            {/* Description */}
            {description ? (
              <>
                <View style={styles.previewDivider} />
                <Text style={styles.previewSectionTitle}>Descripción</Text>
                <Text style={styles.previewDescription}>{description}</Text>
              </>
            ) : null}

            {/* Photo strip */}
            {photos.length > 1 && (
              <>
                <View style={styles.previewDivider} />
                <Text style={styles.previewSectionTitle}>Fotos ({photos.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {photos.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={styles.previewThumb} resizeMode="cover" />
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </ScrollView>

        {/* Publish button */}
        <View style={styles.previewFooter}>
          <TouchableOpacity
            style={[styles.publishBtn, loading && styles.submitDisabled]}
            onPress={handlePublish}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.publishBtnText}>Publicar producto</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Publicar producto</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Title */}
        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Taladro percutor Bosch"
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
        />

        {/* Description */}
        <View style={styles.descLabelRow}>
          <Text style={styles.label}>Descripción</Text>
          <TouchableOpacity
            style={[styles.aiBtn, generatingDesc && styles.aiBtnDisabled]}
            onPress={handleGenerateDescription}
            disabled={generatingDesc}
            activeOpacity={0.7}
          >
            {generatingDesc ? (
              <ActivityIndicator size="small" color={TEAL} />
            ) : (
              <Text style={styles.aiBtnText}>✨ Generar descripción</Text>
            )}
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Describe el estado, características y condiciones de uso..."
          placeholderTextColor="#9ca3af"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Category */}
        <Text style={styles.label}>Categoría *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setCategoryModal(true)} activeOpacity={0.7}>
          <Text style={[styles.selectText, !category && styles.placeholder]}>
            {category || 'Seleccionar categoría'}
          </Text>
          <ChevronDown size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        {/* Prices */}
        <Text style={styles.label}>Precio por día (€) *</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#9ca3af"
          value={pricePerDay}
          onChangeText={setPricePerDay}
          keyboardType="numeric"
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Precio por semana (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="Opcional"
              placeholderTextColor="#9ca3af"
              value={pricePerWeek}
              onChangeText={setPricePerWeek}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Precio por mes (€)</Text>
            <TextInput
              style={styles.input}
              placeholder="Opcional"
              placeholderTextColor="#9ca3af"
              value={pricePerMonth}
              onChangeText={setPricePerMonth}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Estimated value */}
        <Text style={styles.label}>Valor estimado (€) *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 800"
          placeholderTextColor="#9ca3af"
          value={estimatedValue}
          onChangeText={setEstimatedValue}
          keyboardType="numeric"
        />
        <Text style={styles.fieldHint}>¿Cuánto vale tu producto? Esto determina la fianza recomendada.</Text>

        {/* Deposit */}
        <Text style={styles.label}>Fianza (€)</Text>
        <TextInput
          style={styles.input}
          placeholder="Opcional"
          placeholderTextColor="#9ca3af"
          value={deposit}
          onChangeText={setDeposit}
          keyboardType="numeric"
        />

        {/* Zone */}
        <Text style={styles.label}>Zona *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setZoneModal(true)} activeOpacity={0.7}>
          <Text style={[styles.selectText, !location && styles.placeholder]}>
            {location || 'Seleccionar zona'}
          </Text>
          <ChevronDown size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>

        {/* Photos */}
        <Text style={styles.label}>Fotos * <Text style={styles.labelHint}>(máx. 5)</Text></Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)} hitSlop={4}>
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

        {/* Availability toggle */}
        <View style={styles.availabilityRow}>
          <View style={styles.availabilityInfo}>
            <Text style={styles.availabilityLabel}>Disponible ahora</Text>
            <Text style={styles.availabilitySub}>
              {availableNow ? 'El producto se publicará activo' : 'El producto se publicará pausado'}
            </Text>
          </View>
          <Switch
            value={availableNow}
            onValueChange={setAvailableNow}
            trackColor={{ false: '#e5e7eb', true: '#d1fae5' }}
            thumbColor={availableNow ? TEAL : '#9ca3af'}
          />
        </View>

        {/* Preview button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={() => { if (validate()) setShowPreview(true); }}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>Previsualizar →</Text>
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
                <FlatList
                  data={CATEGORIES}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalOption, item === category && styles.modalOptionActive]}
                      onPress={() => { setCategory(item); setCategoryModal(false); }}
                      activeOpacity={0.7}
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
                <FlatList
                  data={ZONES}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalOption, item === location && styles.modalOptionActive]}
                      onPress={() => { setLocation(item); setZoneModal(false); }}
                      activeOpacity={0.7}
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
  container: { flex: 1, backgroundColor: '#fff' },

  // Form header
  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  form: { paddingHorizontal: 24, paddingTop: 24 },

  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  labelHint: { fontSize: 12, fontWeight: '400', color: '#9ca3af', textTransform: 'none' },
  fieldHint: { fontSize: 12, color: '#9ca3af', marginTop: -12, marginBottom: 18, lineHeight: 17 },

  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 18,
  },
  multiline: { height: 100, paddingTop: 12 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 18,
  },
  selectText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  placeholder: { color: '#9ca3af', fontWeight: '400' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  // Description label row with AI button
  descLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0faf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 42,
    justifyContent: 'center',
  },
  aiBtnDisabled: { opacity: 0.6 },
  aiBtnText: { fontSize: 12, fontWeight: '600', color: TEAL },

  // Availability toggle
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  availabilityInfo: { flex: 1 },
  availabilityLabel: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  availabilitySub: { fontSize: 12, color: '#6b7280' },

  // Photos
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
    backgroundColor: '#f0faf5',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11, color: TEAL, fontWeight: '600', textAlign: 'center', lineHeight: 14 },

  // Form submit
  submitButton: {
    backgroundColor: TEAL, borderRadius: 14, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Modals
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

  // ── Preview styles ────────────────────────────────────────────────────────────
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  previewBack: { padding: 4 },
  previewHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  editLink: { fontSize: 15, fontWeight: '600', color: TEAL, padding: 4 },

  previewPhoto: { width: '100%', height: 260, backgroundColor: '#f3f4f6' },
  previewPhotoPlaceholder: { width: '100%', height: 260, backgroundColor: '#e5e7eb' },

  previewContent: { paddingHorizontal: 24, paddingTop: 20 },
  previewCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0faf5', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
  },
  previewCategoryText: { color: TEAL, fontSize: 12, fontWeight: '600' },
  previewTitle: { fontSize: 22, fontWeight: '700', color: '#111827', lineHeight: 28, marginBottom: 8 },
  previewLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  previewLocationText: { fontSize: 14, color: '#6b7280' },

  previewPriceSection: { marginBottom: 16 },
  previewPriceDay: { fontSize: 28, fontWeight: '800', color: TEAL },
  previewPriceDayLabel: { fontSize: 16, fontWeight: '500', color: '#9ca3af' },
  previewPriceBadges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  previewPriceBadge: { backgroundColor: '#f0faf5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  previewPriceBadgeText: { color: TEAL, fontSize: 13, fontWeight: '600' },
  previewEstimatedValue: { fontSize: 13, color: '#9ca3af', marginTop: 8 },

  previewDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 18 },

  previewAvailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewAvailBadge: {
    backgroundColor: '#d1fae5', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  previewAvailBadgePaused: { backgroundColor: '#f3f4f6' },
  previewAvailText: { fontSize: 13, fontWeight: '600', color: '#059669' },
  previewAvailTextPaused: { color: '#6b7280' },
  previewDeposit: { fontSize: 13, color: '#6b7280' },

  previewSectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  previewDescription: { fontSize: 15, color: '#4b5563', lineHeight: 24 },
  previewThumb: { width: 80, height: 80, borderRadius: 10 },

  // Preview footer
  previewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  publishBtn: {
    backgroundColor: TEAL, borderRadius: 14, height: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
