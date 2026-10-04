import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
  doc, setDoc, collection, query, where, getDocs, addDoc,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralInput, setReferralInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: name });

      const ownCode = user.uid.slice(0, 6).toUpperCase();
      await setDoc(doc(db, 'users', user.uid), {
        displayName: name,
        email: user.email,
        referralCode: ownCode,
        createdAt: new Date().toISOString(),
      }, { merge: true });

      const code = referralInput.trim().toUpperCase();
      if (code) {
        try {
          const refSnap = await getDocs(
            query(collection(db, 'users'), where('referralCode', '==', code)),
          );
          if (!refSnap.empty) {
            const referrerId = refSnap.docs[0].id;
            await addDoc(collection(db, 'referrals'), {
              referrerId,
              newUserId: user.uid,
              newUserName: name,
              code,
              createdAt: new Date().toISOString(),
              status: 'pending',
            });
          }
        } catch {
          // Referral lookup failed — registration still succeeds
        }
      }

      router.replace('/(tabs)/');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Rentalova</Text>
        <Text style={styles.subtitle}>Crea tu cuenta</Text>

        <TextInput
          style={styles.input}
          placeholder="Nombre completo"
          placeholderTextColor="#9ca3af"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={[styles.input, { marginBottom: 20 }]}
          placeholder="Código de referido (opcional)"
          placeholderTextColor="#9ca3af"
          value={referralInput}
          onChangeText={setReferralInput}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Crear cuenta</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkRow}>
            <Text style={styles.linkText}>
              ¿Ya tienes cuenta? <Text style={styles.linkAccent}>Inicia sesión</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: '#4b9c78',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 32,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 14,
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#4b9c78',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkRow: {
    marginTop: 28,
  },
  linkText: {
    fontSize: 14,
    color: '#6b7280',
  },
  linkAccent: {
    color: '#4b9c78',
    fontWeight: '600',
  },
});
