import { type ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const TEAL = '#4b9c78';

export type AlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' };

export type CustomAlertProps = {
  visible: boolean;
  icon: ReactNode;
  iconBg: string;
  title: string;
  message: string;
  buttons: AlertButton[];
};

export default function CustomAlert({ visible, icon, iconBg, title, message, buttons }: CustomAlertProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.btnRow}>
            {buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.btn, btn.style === 'cancel' && styles.btnCancel]}
                onPress={btn.onPress}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, btn.style === 'cancel' && styles.btnCancelText]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  btnRow: { width: '100%', gap: 8 },
  btn: { backgroundColor: TEAL, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { backgroundColor: '#f3f4f6' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnCancelText: { color: '#374151', fontWeight: '600' },
});
