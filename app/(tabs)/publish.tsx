import { useState, Fragment } from 'react';
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
import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { X, ChevronDown, ImagePlus, MapPin, ChevronLeft } from 'lucide-react-native';
import { db, storage, auth } from '../../lib/firebase';

const TEAL = '#4b9c78';

const CATEGORIES = [
  { label: 'Herramientas', icon: '🔧' },
  { label: 'Camping', icon: '⛺' },
  { label: 'Electrónica', icon: '📱' },
  { label: 'Deporte', icon: '⚽' },
  { label: 'Hogar y jardín', icon: '🏡' },
  { label: 'Fotografía y vídeo', icon: '📸' },
  { label: 'Audio y música', icon: '🎵' },
  { label: 'Transporte', icon: '🚗' },
  { label: 'Bebé y niños', icon: '👶' },
  { label: 'Bricolaje y construcción', icon: '🏗️' },
  { label: 'Cocina y hostelería', icon: '🍳' },
  { label: 'Ropa y moda', icon: '👗' },
  { label: 'Juegos y consolas', icon: '🎮' },
  { label: 'Libros y educación', icon: '📚' },
  { label: 'Mascotas', icon: '🐾' },
  { label: 'Oficina y papelería', icon: '📎' },
  { label: 'Otros', icon: '📦' },
];

const ZONES = [
  'Centro', 'Arganzuela', 'Retiro', 'Salamanca', 'Chamartín', 'Tetuán', 'Chamberí',
  'Fuencarral', 'Moncloa', 'Latina', 'Carabanchel', 'Usera', 'Puente de Vallecas',
  'Moratalaz', 'Ciudad Lineal', 'Hortaleza', 'Villaverde', 'Villa de Vallecas',
  'Vicálvaro', 'San Blas', 'Barajas', 'Alcobendas', 'Getafe', 'Leganés',
  'Móstoles', 'Alcorcón', 'Pozuelo',
];

const STEP_LABELS = ['Categoría', 'Detalles', 'Precios', 'Fotos'];

export default function PublishScreen() {
  const [step, setStep] = useState(1);
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

  const [zoneModal, setZoneModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // ─── Image picking ──────────────────────────────────────────────────────────
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

  // ─── Step validation ────────────────────────────────────────────────────────
  function validateStep(): boolean {
    if (step === 1) {
      if (!category) { Alert.alert('Campo requerido', 'Selecciona una categoría.'); return false; }
    } else if (step === 2) {
      if (!title.trim()) { Alert.alert('Campo requerido', 'Añade un título al producto.'); return false; }
      if (!location) { Alert.alert('Campo requerido', 'Selecciona una zona.'); return false; }
    } else if (step === 3) {
      if (!pricePerDay || isNaN(Number(pricePerDay))) { Alert.alert('Campo requerido', 'Introduce un precio por día válido.'); return false; }
      if (!estimatedValue || isNaN(Number(estimatedValue))) { Alert.alert('Campo requerido', 'Introduce el valor estimado del producto.'); return false; }
    } else if (step === 4) {
      if (photos.length === 0) { Alert.alert('Fotos requeridas', 'Añade al menos una foto del producto.'); return false; }
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((s) => s + 1);
  }

  function goBack() {
    setStep((s) => s - 1);
  }

  // ─── AI description ─────────────────────────────────────────────────────────
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

  // ─── Publish ────────────────────────────────────────────────────────────────
  async function handlePublish() {
    const user = auth.currentUser;
    if (!user) { router.replace('/(auth)/login'); return; }
    setLoading(true);
    try {
      const uploadedUrls = await Promise.all(photos.map((uri) => uploadPhoto(uri, user.uid)));
      const ref = await addDoc(collection(db, 'products'), {
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
        averageRating: 0,
        reviewCount: 0,
        isAvailable: true,
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(db, 'products', ref.id), { productId: ref.id });
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
          {photos[0] ? (
            <Image source={{ uri: photos[0] }} style={styles.previewPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.previewPhotoPlaceholder} />
          )}

          <View style={styles.previewContent}>
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

            {description ? (
              <>
                <View style={styles.previewDivider} />
                <Text style={styles.previewSectionTitle}>Descripción</Text>
                <Text style={styles.previewDescription}>{description}</Text>
              </>
            ) : null}

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

        <View style={styles.previewFooter}>
          <TouchableOpacity
            style={[styles.publishBtn, loading && styles.btnDisabled]}
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

  // ─── Step content renderers ──────────────────────────────────────────────────
  function renderStep1() {
    const rows: (typeof CATEGORIES)[] = [];
    for (let i = 0; i < CATEGORIES.length; i += 3) {
      rows.push(CATEGORIES.slice(i, i + 3));
    }
    return (
      <View>
        <Text style={styles.stepSubtitle}>¿Qué tipo de producto es?</Text>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.categoryRow}>
            {row.map((cat) => (
              <TouchableOpacity
                key={cat.label}
                style={[styles.categoryCell, category === cat.label && styles.categoryCellActive]}
                onPress={() => setCategory(cat.label)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text
                  style={[styles.categoryLabel, category === cat.label && styles.categoryLabelActive]}
                  numberOfLines={2}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
            {row.length < 3 &&
              Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`empty-${i}`} style={[styles.categoryCell, styles.categoryCellEmpty]} />
              ))}
          </View>
        ))}
      </View>
    );
  }

  function renderStep2() {
    return (
      <View>
        <Text style={styles.stepSubtitle}>Cuéntanos más sobre el producto</Text>

        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Taladro percutor Bosch"
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
        />

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

        <Text style={styles.label}>Zona *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setZoneModal(true)} activeOpacity={0.7}>
          <Text style={[styles.selectText, !location && styles.placeholder]}>
            {location || 'Seleccionar zona'}
          </Text>
          <ChevronDown size={16} color="#9ca3af" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderStep3() {
    return (
      <View>
        <Text style={styles.stepSubtitle}>Establece el precio de tu producto</Text>

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
            <Text style={styles.label}>Por semana (€)</Text>
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
            <Text style={styles.label}>Por mes (€)</Text>
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

        <Text style={styles.label}>Fianza (€)</Text>
        <TextInput
          style={styles.input}
          placeholder="Opcional"
          placeholderTextColor="#9ca3af"
          value={deposit}
          onChangeText={setDeposit}
          keyboardType="numeric"
        />
      </View>
    );
  }

  function renderStep4() {
    return (
      <View>
        <Text style={styles.stepSubtitle}>Añade fotos y configura la disponibilidad</Text>

        <Text style={styles.label}>
          Fotos * <Text style={styles.labelHint}>(mín. 1, máx. 5)</Text>
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photosRow}
        >
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
      </View>
    );
  }

  // ─── Main render ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/')} hitSlop={8} style={styles.backBtn}>
          <ChevronLeft size={24} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publicar producto</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        {STEP_LABELS.map((label, idx) => (
          <Fragment key={idx}>
            {idx > 0 && (
              <View
                style={[
                  styles.progressConnector,
                  idx < step && styles.progressConnectorActive,
                ]}
              />
            )}
            <View style={styles.progressStep}>
              <View
                style={[
                  styles.progressCircle,
                  idx + 1 === step && styles.progressCircleActive,
                  idx + 1 < step && styles.progressCircleDone,
                ]}
              >
                <Text
                  style={[
                    styles.progressCircleText,
                    idx + 1 <= step && styles.progressCircleTextActive,
                  ]}
                >
                  {idx + 1 < step ? '✓' : idx + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.progressStepLabel,
                  idx + 1 === step && styles.progressStepLabelActive,
                ]}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        ))}
      </View>

      {/* Step content */}
      <ScrollView
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Footer navigation */}
      <View style={styles.footer}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backStepBtn} onPress={goBack} activeOpacity={0.7}>
            <ChevronLeft size={18} color={TEAL} strokeWidth={2.5} />
            <Text style={styles.backStepText}>Atrás</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerSpacer} />
        )}
        <TouchableOpacity
          style={[styles.nextBtn, loading && styles.btnDisabled]}
          onPress={step < 4 ? goNext : handlePublish}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.nextBtnText}>
              {step < 4 ? 'Siguiente' : 'Publicar producto'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Zone modal */}
      <Modal
        visible={zoneModal}
        transparent
        animationType="fade"
        onRequestClose={() => setZoneModal(false)}
      >
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
                      <Text style={[styles.modalOptionText, item === location && styles.modalOptionTextActive]}>
                        {item}
                      </Text>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  headerRight: { width: 32 },

  // Progress bar
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  progressStep: { alignItems: 'center', gap: 6 },
  progressConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginTop: 13,
    marginHorizontal: 4,
  },
  progressConnectorActive: { backgroundColor: TEAL },
  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCircleActive: { backgroundColor: '#fff', borderColor: TEAL },
  progressCircleDone: { backgroundColor: TEAL, borderColor: TEAL },
  progressCircleText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  progressCircleTextActive: { color: TEAL },
  progressStepLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '500', textAlign: 'center' },
  progressStepLabelActive: { color: TEAL, fontWeight: '700' },

  // Step content
  stepContent: { paddingHorizontal: 20, paddingTop: 20 },
  stepSubtitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
    lineHeight: 24,
  },

  // Category grid
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  categoryCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    gap: 8,
    minHeight: 84,
  },
  categoryCellActive: {
    backgroundColor: '#f0faf5',
    borderColor: TEAL,
  },
  categoryCellEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  categoryIcon: { fontSize: 28 },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 14,
  },
  categoryLabelActive: { color: TEAL },

  // Form fields
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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

  // Footer navigation
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  footerSpacer: { width: 80 },
  backStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  backStepText: { fontSize: 15, fontWeight: '600', color: TEAL },
  nextBtn: {
    flex: 1,
    backgroundColor: TEAL,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

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

  previewFooter: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
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
