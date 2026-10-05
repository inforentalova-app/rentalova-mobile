import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  Share,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, collection, query, where, limit, getDocs, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';

LocaleConfig.locales['es'] = {
  monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  monthNamesShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy',
};
LocaleConfig.defaultLocale = 'es';
import { Linking } from 'react-native';
import { ChevronLeft, MapPin, Star, Share2, MoreVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { db, auth } from '../../lib/firebase';

const TEAL = '#4b9c78';
const TEAL_LIGHT = '#e8f5ef';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TODAY = new Date().toISOString().split('T')[0];

type Product = {
  id: string;
  title: string;
  category: string;
  location: string;
  description: string;
  pricePerDay: number;
  pricePerWeek?: number;
  pricePerMonth?: number;
  estimatedValue?: number;
  deposit?: number;
  photos: string[];
  ownerId?: string;
  ownerName?: string;
  ownerRating?: number;
  status?: string;
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [ownerProducts, setOwnerProducts] = useState<Product[]>([]);
  const [unavailableDates, setUnavailableDates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [contacting, setContacting] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  const [contractModalVisible, setContractModalVisible] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function fetchProduct() {
      try {
        const snap = await getDoc(doc(db, 'products', id));
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as Product;
          setProduct(data);
          if (data.ownerId) fetchOwnerProducts(data.ownerId, data.id);
          fetchUnavailableDates(snap.id);
        }
      } catch (e) {
        console.error('Error fetching product:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  async function fetchUnavailableDates(productId: string) {
    try {
      const snap = await getDocs(
        query(collection(db, 'rentals'), where('productId', '==', productId)),
      );
      const blocked = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data();
        const BLOCKING_STATUSES = new Set(['payment_pending', 'deposit_pending', 'approved', 'owner_delivered', 'active', 'renter_returning', 'pending_owner_confirmation', 'completed']);
        if (!BLOCKING_STATUSES.has(data.status)) return;
        const start: Date = data.startDate?.toDate?.() ?? new Date(data.startDate);
        const end: Date = data.endDate?.toDate?.() ?? new Date(data.endDate);
        const cursor = new Date(start);
        while (cursor <= end) {
          blocked.add(cursor.toISOString().split('T')[0]);
          cursor.setDate(cursor.getDate() + 1);
        }
      });
      setUnavailableDates(blocked);
    } catch (e) {
      console.error('Error fetching unavailable dates:', e);
    }
  }

  async function fetchOwnerProducts(ownerId: string, currentId: string) {
    try {
      const q = query(
        collection(db, 'products'),
        where('ownerId', '==', ownerId),
        where('status', '==', 'active'),
        limit(6),
      );
      const snap = await getDocs(q);
      setOwnerProducts(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Product))
          .filter((p) => p.id !== currentId)
          .slice(0, 5),
      );
    } catch (e) {
      console.error('Error fetching owner products:', e);
    }
  }

  function onDayPress(day: DateData) {
    const dateStr = day.dateString;
    if (unavailableDates.has(dateStr)) return;
    if (!startDate || (startDate && endDate)) {
      setStartDate(dateStr);
      setEndDate(null);
    } else {
      if (dateStr < startDate) {
        setStartDate(dateStr);
      } else if (dateStr === startDate) {
        setStartDate(null);
      } else {
        setEndDate(dateStr);
      }
    }
  }

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    // Step 1: Mark all days from today to +3 months as available (light teal)
    const horizon = new Date(TODAY);
    horizon.setMonth(horizon.getMonth() + 3);
    const cur = new Date(TODAY);
    while (cur <= horizon) {
      const ds = cur.toISOString().split('T')[0];
      marks[ds] = { startingDay: true, endingDay: true, color: TEAL_LIGHT, textColor: TEAL };
      cur.setDate(cur.getDate() + 1);
    }

    // Step 2: Override unavailable days in red (disabled)
    unavailableDates.forEach((d) => {
      marks[d] = {
        startingDay: true,
        endingDay: true,
        color: '#fee2e2',
        textColor: '#ef4444',
        disabled: true,
        disableTouchEvent: true,
      };
    });

    // Step 3: Overlay selected range in solid teal
    if (startDate && !unavailableDates.has(startDate)) {
      marks[startDate] = {
        startingDay: true,
        color: TEAL,
        textColor: '#fff',
        ...(startDate === endDate || !endDate ? { endingDay: true } : {}),
      };

      if (endDate && endDate !== startDate && !unavailableDates.has(endDate)) {
        const cursor = new Date(startDate);
        cursor.setDate(cursor.getDate() + 1);
        const end = new Date(endDate);
        while (cursor < end) {
          const ds = cursor.toISOString().split('T')[0];
          if (!unavailableDates.has(ds)) {
            marks[ds] = { color: TEAL_LIGHT, textColor: '#111827' };
          }
          cursor.setDate(cursor.getDate() + 1);
        }
        marks[endDate] = { endingDay: true, color: TEAL, textColor: '#fff' };
      }
    }

    return marks;
  }, [startDate, endDate, unavailableDates]);

  const totalDays =
    startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000))
      : null;
  const totalPrice =
    totalDays != null && product?.pricePerDay != null ? totalDays * product.pricePerDay : null;

  async function handleShare() {
    if (!product) return;
    try {
      await Share.share({
        message: `${product.title} — ${product.pricePerDay}€/día\nhttps://www.rentalova.com/products/${product.id}`,
        url: `https://www.rentalova.com/products/${product.id}`,
      });
    } catch (e) {
      console.error('Error sharing:', e);
    }
  }

  async function submitReport(reason: string) {
    try {
      const user = auth.currentUser;
      await addDoc(collection(db, 'disputes'), {
        type: 'product_report',
        productId: product?.id ?? id,
        productTitle: product?.title ?? null,
        reporterId: user?.uid ?? null,
        reason,
        status: 'open',
        createdAt: Timestamp.now(),
      });
      Alert.alert('Reporte enviado', 'Gracias por tu reporte. Lo revisaremos en breve.');
    } catch (e) {
      console.error('Error submitting report:', e);
    }
  }

  function handleReport() {
    Alert.alert(
      'Reportar producto',
      '¿Por qué quieres reportar este producto?',
      [
        { text: 'Contenido inapropiado', onPress: () => submitReport('inappropriate_content') },
        { text: 'Producto falso', onPress: () => submitReport('fake_product') },
        { text: 'Precio abusivo', onPress: () => submitReport('abusive_price') },
        { text: 'Otro', onPress: () => submitReport('other') },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }

  async function handleContact() {
    const user = auth.currentUser;
    if (!user) { router.push('/(auth)/login'); return; }
    if (!product?.ownerId) return;
    if (user.uid === product.ownerId) {
      Alert.alert('Aviso', 'No puedes iniciar un chat contigo mismo.');
      return;
    }
    setContacting(true);
    try {
      // Find existing conversation between these two users
      const snap = await getDocs(
        query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid)),
      );
      const existing = snap.docs.find((d) => {
        const p: string[] = d.data().participants ?? [];
        return p.includes(product.ownerId!);
      });

      if (existing) {
        router.push(`/chat/${existing.id}`);
        return;
      }

      // Create new conversation
      const convRef = await addDoc(collection(db, 'conversations'), {
        participants: [user.uid, product.ownerId],
        participantNames: {
          [user.uid]: user.displayName ?? 'Usuario',
          [product.ownerId]: product.ownerName ?? 'Usuario',
        },
        participantPhotos: {
          [user.uid]: user.photoURL ?? '',
          [product.ownerId]: '',
        },
        productId: product.id,
        productTitle: product.title,
        productPhoto: product.photos?.[0] ?? null,
        lastMessage: null,
        lastMessageAt: Timestamp.now(),
        lastMessageSenderId: null,
        unreadCount: { [user.uid]: 0, [product.ownerId]: 0 },
        createdAt: Timestamp.now(),
      });
      router.push(`/chat/${convRef.id}`);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo abrir el chat.');
    } finally {
      setContacting(false);
    }
  }

  function openContractModal() {
    const user = auth.currentUser;
    if (!user) { router.push('/(auth)/login'); return; }
    if (!startDate || !endDate) {
      Alert.alert('Fechas requeridas', 'Selecciona las fechas de inicio y fin en el calendario.');
      return;
    }
    setContractAccepted(false);
    setContractModalVisible(true);
  }

  async function handleRent() {
    const user = auth.currentUser;
    if (!user) {
      router.push('/(auth)/login');
      return;
    }
    if (!startDate || !endDate) {
      Alert.alert('Fechas requeridas', 'Selecciona las fechas de inicio y fin en el calendario.');
      return;
    }
    if (!product) return;
    setSubmitting(true);
    try {
      const ref = await addDoc(collection(db, 'rentals'), {
        productId: product.id,
        productTitle: product.title,
        ownerId: product.ownerId ?? null,
        ownerName: product.ownerName ?? null,
        renterId: user.uid,
        renterName: user.displayName ?? null,
        startDate: startDate,
        endDate: endDate,
        productPhotoUrl: product.photos?.[0] ?? '',
        totalPrice: totalPrice ?? null,
        status: 'pending',
        createdAt: Timestamp.now(),
      });
      await updateDoc(ref, { rentalId: ref.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        '¡Solicitud enviada!',
        'Solicitud enviada. El propietario tiene que aceptarla antes de proceder al pago.',
        [{ text: 'Ver mis alquileres', onPress: () => router.replace('/my-rentals') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Producto no encontrado</Text>
      </View>
    );
  }

  const photos = product.photos?.length ? product.photos : [];

  return (
    <View style={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
        <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Share + Report buttons */}
      <TouchableOpacity style={styles.shareButton} onPress={handleShare} hitSlop={8}>
        <Share2 size={18} color="#111827" strokeWidth={2} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.reportButton} onPress={handleReport} hitSlop={8}>
        <MoreVertical size={18} color="#111827" strokeWidth={2} />
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Photo carousel ── */}
        <View style={styles.carouselContainer}>
          {photos.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
                scrollEventThrottle={16}
              >
                {photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.photo} resizeMode="cover" />
                ))}
              </ScrollView>
              {photos.length > 1 && (
                <View style={styles.dots}>
                  {photos.map((_, i) => (
                    <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.photoPlaceholder} />
          )}
        </View>

        <View style={styles.content}>

          {/* Category badge */}
          {product.category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{product.category}</Text>
            </View>
          ) : null}

          {/* Title */}
          <Text style={styles.title}>{product.title}</Text>

          {/* Location */}
          {product.location ? (
            <View style={styles.locationRow}>
              <MapPin size={14} color="#9ca3af" strokeWidth={2} />
              <Text style={styles.locationText}>{product.location}</Text>
            </View>
          ) : null}

          {/* Prices */}
          <View style={styles.priceSection}>
            <Text style={styles.priceDay}>
              {product.pricePerDay != null ? `${product.pricePerDay}€` : '—'}
              <Text style={styles.priceDayLabel}>/día</Text>
            </Text>
            <View style={styles.priceBadges}>
              {product.pricePerWeek != null && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>{product.pricePerWeek}€/semana</Text>
                </View>
              )}
              {product.pricePerMonth != null && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceBadgeText}>{product.pricePerMonth}€/mes</Text>
                </View>
              )}
            </View>
            {product.estimatedValue != null && (
              <Text style={styles.estimatedValue}>Valor estimado: {product.estimatedValue}€</Text>
            )}
          </View>

          <View style={styles.divider} />

          {/* Description */}
          {product.description ? (
            <>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text
                style={styles.description}
                numberOfLines={descriptionExpanded ? undefined : 3}
                onTextLayout={(e) => {
                  if (!descriptionExpanded && e.nativeEvent.lines.length >= 3) {
                    setDescriptionTruncated(true);
                  }
                }}
              >
                {product.description}
              </Text>
              {!descriptionExpanded && descriptionTruncated && (
                <TouchableOpacity onPress={() => setDescriptionExpanded(true)} activeOpacity={0.7}>
                  <Text style={styles.showMoreText}>Ver más</Text>
                </TouchableOpacity>
              )}
              {descriptionExpanded && (
                <TouchableOpacity onPress={() => setDescriptionExpanded(false)} activeOpacity={0.7}>
                  <Text style={styles.showMoreText}>Ver menos</Text>
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
            </>
          ) : null}

          {/* Owner */}
          {(product.ownerName || product.ownerId) ? (
            <>
              <Text style={styles.sectionTitle}>Propietario</Text>
              <View style={styles.ownerRow}>
                <View style={styles.ownerAvatar}>
                  <Text style={styles.ownerInitial}>
                    {(product.ownerName ?? 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ownerNameText}>{product.ownerName ?? 'Usuario'}</Text>
                  {product.ownerRating != null && (
                    <View style={styles.ratingRow}>
                      <Star size={13} color="#f59e0b" fill="#f59e0b" strokeWidth={0} />
                      <Text style={styles.ratingText}>{product.ownerRating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                {product.ownerId ? (
                  <TouchableOpacity
                    style={styles.ownerProfileBtn}
                    onPress={() => router.push(`/user/${product.ownerId}`)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ownerProfileBtnText}>Ver perfil</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.divider} />
            </>
          ) : null}

          {/* ── Calendar ── */}
          <Text style={styles.sectionTitle}>Selecciona las fechas</Text>
          <Text style={styles.calendarHint}>
            {!startDate
              ? 'Toca el día de inicio'
              : !endDate
              ? 'Ahora toca el día de fin'
              : `${startDate} → ${endDate}`}
          </Text>
          <View style={styles.calendarWrapper}>
            <Calendar
              onDayPress={onDayPress}
              markedDates={markedDates}
              markingType="period"
              minDate={TODAY}
              theme={{
                todayTextColor: TEAL,
                selectedDayBackgroundColor: TEAL,
                arrowColor: TEAL,
                dotColor: TEAL,
                textDayFontSize: 14,
                textMonthFontSize: 15,
                textMonthFontWeight: '700',
                textDayHeaderFontSize: 12,
              }}
            />
          </View>

          {totalDays != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{totalDays} día{totalDays !== 1 ? 's' : ''}</Text>
              <Text style={styles.totalPrice}>{totalPrice}€ total</Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* ── Ubicación ── */}
          {product.location ? (
            <>
              <Text style={styles.sectionTitle}>Ubicación</Text>
              <TouchableOpacity
                style={styles.mapsButton}
                activeOpacity={0.7}
                onPress={() =>
                  Linking.openURL(
                    'https://www.google.com/maps/search/' + encodeURIComponent(product.location + ', Madrid'),
                  )
                }
              >
                <MapPin size={15} color={TEAL} strokeWidth={2} />
                <Text style={styles.mapsButtonText}>{product.location}, Madrid</Text>
                <Text style={styles.mapsButtonCta}>Ver en Google Maps →</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <View style={styles.divider} />

          {/* ── Solicitar alquiler ── */}
          <TouchableOpacity
            style={[styles.rentButtonInline, submitting && styles.rentButtonDisabled]}
            activeOpacity={0.85}
            onPress={openContractModal}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.rentButtonText}>
                {totalPrice != null ? `Solicitar alquiler · ${totalPrice}€` : 'Solicitar alquiler'}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Contactar ── */}
          <TouchableOpacity
            style={[styles.contactButton, contacting && styles.rentButtonDisabled]}
            activeOpacity={0.8}
            onPress={handleContact}
            disabled={contacting}
          >
            {contacting ? (
              <ActivityIndicator color={TEAL} size="small" />
            ) : (
              <Text style={styles.contactButtonText}>Contactar con el propietario</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* ── Más de este propietario ── */}
          {ownerProducts.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Más de este propietario</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ownerProductsScroll}
              >
                {ownerProducts.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.ownerProductCard}
                    activeOpacity={0.8}
                    onPress={() => router.replace(`/product/${p.id}`)}
                  >
                    {p.photos?.[0] ? (
                      <Image source={{ uri: p.photos[0] }} style={styles.ownerProductPhoto} resizeMode="cover" />
                    ) : (
                      <View style={[styles.ownerProductPhoto, { backgroundColor: '#e5e7eb' }]} />
                    )}
                    <View style={styles.ownerProductBody}>
                      <Text style={styles.ownerProductTitle} numberOfLines={2}>{p.title}</Text>
                      <Text style={styles.ownerProductPrice}>
                        {p.pricePerDay != null ? `${p.pricePerDay}€/día` : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {/* Contract modal */}
      <Modal
        visible={contractModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContractModalVisible(false)}
      >
          <View style={styles.contractOverlay} onTouchEnd={() => setContractModalVisible(false)}>
              <View style={styles.contractSheet} pointerEvents="box-none" onTouchEnd={(e) => e.stopPropagation()}>
                {/* Header */}
                <View style={styles.contractHeader}>
                  <Text style={styles.contractTitle}>Contrato de alquiler</Text>
                  <TouchableOpacity onPress={() => setContractModalVisible(false)} hitSlop={8}>
                    <Text style={styles.contractClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Body */}
                <ScrollView
                  style={[styles.contractScroll, { maxHeight: 400 }]}
                  contentContainerStyle={styles.contractScrollContent}
                  showsVerticalScrollIndicator={true}
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                >
                  <Text style={styles.contractIntro}>
                    En Madrid, a{' '}
                    <Text style={styles.contractBold}>
                      {new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                    , entre las partes:
                  </Text>

                  <View style={styles.contractParties}>
                    <Text style={styles.contractPartyLine}>
                      <Text style={styles.contractBold}>ARRENDADOR:</Text>{' '}
                      {product.ownerName ?? '—'}
                    </Text>
                    <Text style={styles.contractPartyLine}>
                      <Text style={styles.contractBold}>ARRENDATARIO:</Text>{' '}
                      {auth.currentUser?.displayName ?? auth.currentUser?.email ?? '—'}
                    </Text>
                  </View>

                  <Text style={styles.contractIntro}>
                    Ambas partes acuerdan suscribir el presente contrato de arrendamiento de bien mueble, sujeto a las siguientes cláusulas:
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 1. BIEN MUEBLE DEL CONTRATO</Text>
                  <Text style={styles.contractText}>El ARRENDADOR cede en arrendamiento al ARRENDATARIO el siguiente bien mueble:</Text>
                  <Text style={styles.contractBullet}>• <Text style={styles.contractBold}>Artículo:</Text> {product.title}</Text>
                  <Text style={styles.contractBullet}>• <Text style={styles.contractBold}>Descripción:</Text> {product.description || 'Sin descripción adicional.'}</Text>

                  <Text style={styles.contractClause}>CLÁUSULA 2. DURACIÓN DEL ARRENDAMIENTO</Text>
                  <Text style={styles.contractText}>
                    El arrendamiento tendrá una duración de{' '}
                    <Text style={styles.contractBold}>{totalDays} {totalDays === 1 ? 'día' : 'días'}</Text>
                    , con fecha de inicio el{' '}
                    <Text style={styles.contractBold}>{startDate?.split('-').reverse().join('/')}</Text>
                    {' '}y fecha de finalización el{' '}
                    <Text style={styles.contractBold}>{endDate?.split('-').reverse().join('/')}</Text>
                    . El arrendatario deberá devolver el bien en la fecha de finalización acordada.
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 3. PRECIO Y FORMA DE PAGO</Text>
                  <Text style={styles.contractText}>
                    El precio del arrendamiento es de{' '}
                    <Text style={styles.contractBold}>{product.pricePerDay}€ por día</Text>
                    , siendo el importe total de{' '}
                    <Text style={styles.contractBold}>{totalPrice}€</Text>
                    {' '}({totalDays} {totalDays === 1 ? 'día' : 'días'} × {product.pricePerDay}€).
                  </Text>
                  <Text style={styles.contractText}>
                    Rentalova aplica una <Text style={styles.contractBold}>comisión del 20%</Text> sobre el importe del alquiler, asumida por el ARRENDADOR. El ARRENDATARIO no asume ninguna comisión adicional.
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 4. FIANZA</Text>
                  <Text style={styles.contractText}>
                    {product.deposit
                      ? `El ARRENDATARIO depositará una fianza de ${product.deposit}€ en concepto de garantía. Dicha fianza será reembolsada en un plazo máximo de 24 horas tras la devolución del bien en las condiciones acordadas.`
                      : 'Este alquiler no requiere fianza adicional.'}
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 5. ENTREGA DEL BIEN MUEBLE</Text>
                  <Text style={styles.contractText}>
                    El ARRENDADOR entregará el bien en el estado acordado en la fecha de inicio del arrendamiento. Se recomienda documentar el estado del bien mediante fotografías obligatorias en el momento de la entrega y devolución, que quedarán registradas en la plataforma Rentalova como evidencia.
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 6. DEVOLUCIÓN</Text>
                  <Text style={styles.contractText}>
                    El ARRENDATARIO se compromete a devolver el bien en la misma condición en que lo recibió, limpio y sin daños. Los gastos derivados de daños, limpieza extraordinaria o pérdida serán descontados de la fianza o repercutidos al ARRENDATARIO.
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 7. RESPONSABILIDADES</Text>
                  <Text style={styles.contractText}>El ARRENDATARIO se compromete a:</Text>
                  <Text style={styles.contractBullet}>• Usar el bien exclusivamente para el fin previsto.</Text>
                  <Text style={styles.contractBullet}>• No ceder o subarrendar el bien a terceros sin consentimiento escrito del ARRENDADOR.</Text>
                  <Text style={styles.contractBullet}>• Informar al ARRENDADOR de cualquier avería, daño o incidencia de forma inmediata.</Text>
                  <Text style={styles.contractText}>
                    El ARRENDADOR declara que el bien se encuentra en buen estado y es apto para el uso previsto.
                  </Text>

                  <Text style={styles.contractClause}>CLÁUSULA 8. CANCELACIÓN</Text>
                  <Text style={styles.contractBullet}>• <Text style={styles.contractBold}>Más de 48h antes:</Text> cancelación gratuita con reembolso completo.</Text>
                  <Text style={styles.contractBullet}>• <Text style={styles.contractBold}>Entre 24h y 48h antes:</Text> se retiene el 50% del importe total. La fianza se reembolsa íntegramente.</Text>
                  <Text style={styles.contractBullet}>• <Text style={styles.contractBold}>Menos de 24h antes:</Text> no se reembolsa el importe del alquiler. La fianza se devuelve si el bien no fue retirado.</Text>

                  <Text style={styles.contractClause}>CLÁUSULA 9. DISPUTAS Y MEDIACIÓN</Text>
                  <Text style={styles.contractText}>
                    En caso de conflicto entre las partes, Rentalova actuará como mediador neutral. Si la mediación no prospera en un plazo de 7 días hábiles, las partes podrán acudir a los tribunales competentes de Madrid.
                  </Text>

                  <Text style={styles.contractFooter}>
                    Este contrato ha sido generado electrónicamente por Rentalova (ASOCIACIÓN JUNIOR EMPRESA SYNKRO, NIF G75285965) y tiene plena validez legal conforme a la Ley 34/2002 de Servicios de la Sociedad de la Información.
                  </Text>
                </ScrollView>

                {/* Footer */}
                <View style={styles.contractFooterBar}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setContractAccepted((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, contractAccepted && styles.checkboxChecked]}>
                      {contractAccepted && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>He leído y acepto los términos del contrato</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.contractAcceptBtn, !contractAccepted && styles.contractAcceptBtnDisabled]}
                    onPress={() => { setContractModalVisible(false); handleRent(); }}
                    disabled={!contractAccepted}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.contractAcceptBtnText}>Aceptar y continuar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.contractCancelBtn}
                    onPress={() => setContractModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.contractCancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
          </View>
      </Modal>

      {/* Back button overlay */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  errorText: { fontSize: 16, color: '#9ca3af' },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  shareButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 56,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  reportButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 6,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  scrollContent: { paddingBottom: 40 },
  carouselContainer: { width: SCREEN_WIDTH, height: 280, backgroundColor: '#f3f4f6' },
  photo: { width: SCREEN_WIDTH, height: 280 },
  photoPlaceholder: { width: SCREEN_WIDTH, height: 280, backgroundColor: '#e5e7eb' },
  dots: {
    position: 'absolute', bottom: 12, width: '100%',
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  content: { paddingHorizontal: 24, paddingTop: 20 },
  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: '#f0faf5',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
  },
  categoryBadgeText: { color: TEAL, fontSize: 12, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', lineHeight: 28, marginBottom: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  locationText: { fontSize: 14, color: '#6b7280' },
  priceSection: { marginBottom: 20 },
  priceDay: { fontSize: 28, fontWeight: '800', color: TEAL },
  priceDayLabel: { fontSize: 16, fontWeight: '500', color: '#9ca3af' },
  priceBadges: { flexDirection: 'row', gap: 8, marginTop: 8 },
  priceBadge: { backgroundColor: '#f0faf5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  priceBadgeText: { color: TEAL, fontSize: 13, fontWeight: '600' },
  estimatedValue: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  description: { fontSize: 15, color: '#4b5563', lineHeight: 24 },
  showMoreText: { fontSize: 14, color: TEAL, fontWeight: '600', marginTop: 6 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ownerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center',
  },
  ownerInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  ownerNameText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  ownerProfileBtn: {
    borderWidth: 1, borderColor: TEAL, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  ownerProfileBtnText: { fontSize: 13, fontWeight: '600', color: TEAL },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { fontSize: 13, color: '#f59e0b', fontWeight: '600' },
  // Calendar
  calendarHint: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  calendarWrapper: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, overflow: 'hidden',
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f0faf5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginTop: 12,
  },
  totalLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  totalPrice: { fontSize: 16, color: TEAL, fontWeight: '700' },
  // Maps button
  mapsButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#f9fafb',
  },
  mapsButtonText: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500' },
  mapsButtonCta: { fontSize: 13, color: TEAL, fontWeight: '600' },
  // Rent button (inline, not fixed)
  rentButtonInline: {
    backgroundColor: TEAL, borderRadius: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  rentButtonDisabled: { opacity: 0.6 },
  rentButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  contactButton: {
    marginTop: 10, borderWidth: 1.5, borderColor: TEAL, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  contactButtonText: { color: TEAL, fontSize: 15, fontWeight: '700' },
  // Owner products
  ownerProductsScroll: { gap: 10, paddingRight: 4 },
  ownerProductCard: {
    width: 130, borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  ownerProductPhoto: { width: '100%', height: 90, backgroundColor: '#f3f4f6' },
  ownerProductBody: { padding: 8 },
  ownerProductTitle: { fontSize: 12, fontWeight: '600', color: '#111827', lineHeight: 16, marginBottom: 4 },
  ownerProductPrice: { fontSize: 12, fontWeight: '700', color: TEAL },

  // Contract modal
  contractOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contractSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  contractHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  contractTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  contractClose: { fontSize: 18, color: '#6b7280', padding: 4 },
  contractScroll: { flexGrow: 0 },
  contractScrollContent: { paddingHorizontal: 20, paddingVertical: 16 },
  contractIntro: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 12 },
  contractParties: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  contractPartyLine: { fontSize: 13, color: '#374151', lineHeight: 20 },
  contractClause: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 16,
    marginBottom: 6,
  },
  contractText: { fontSize: 13, color: '#4b5563', lineHeight: 20, marginBottom: 8 },
  contractBullet: { fontSize: 13, color: '#4b5563', lineHeight: 20, marginBottom: 4, paddingLeft: 4 },
  contractBold: { fontWeight: '700', color: '#111827' },
  contractFooter: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 16,
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  contractFooterBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: TEAL, borderColor: TEAL },
  checkboxCheck: { fontSize: 12, color: '#fff', fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },
  contractAcceptBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractAcceptBtnDisabled: { backgroundColor: '#9ca3af' },
  contractAcceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  contractCancelBtn: {
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractCancelBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
