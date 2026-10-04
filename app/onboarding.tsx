import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Home, DollarSign, Shield } from 'lucide-react-native';

const TEAL = '#4b9c78';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    icon: Home,
    title: 'Alquila lo que necesitas',
    description: 'Accede a miles de productos en Madrid sin tener que comprarlos',
  },
  {
    icon: DollarSign,
    title: 'Gana dinero extra',
    description: 'Publica tus productos y genera ingresos cuando no los uses',
  },
  {
    icon: Shield,
    title: '100% seguro',
    description:
      'Pagos protegidos, verificación de identidad y fianza gestionada por Rentalova',
  },
];

async function markSeen() {
  await AsyncStorage.setItem('onboarding_seen', 'true');
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function handleSkip() {
    await markSeen();
    router.replace('/(auth)/login');
  }

  async function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setCurrentIndex(next);
    } else {
      await markSeen();
      router.replace('/(auth)/login');
    }
  }

  function renderSlide({ item }: { item: typeof SLIDES[number] }) {
    const Icon = item.icon;
    return (
      <View style={styles.slide}>
        <View style={styles.iconWrap}>
          <Icon size={72} color={TEAL} strokeWidth={1.5} />
        </View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDesc}>{item.description}</Text>
      </View>
    );
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip} hitSlop={12}>
        <Text style={styles.skipText}>Saltar</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={styles.list}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{isLast ? 'Empezar' : 'Siguiente'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 44,
    right: 24,
    zIndex: 10,
  },
  skipText: { fontSize: 15, color: '#9ca3af', fontWeight: '500' },

  list: { flex: 1 },

  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
  },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#f0faf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  slideDesc: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },

  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 52 : 36,
    paddingTop: 24,
    alignItems: 'center',
    gap: 24,
  },
  dots: { flexDirection: 'row', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  dotActive: {
    backgroundColor: TEAL,
    width: 24,
  },

  button: {
    width: '100%',
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
