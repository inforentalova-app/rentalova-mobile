import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, limit, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MessageCircle } from 'lucide-react-native';
import { db, auth } from '../../lib/firebase';
import { useTheme } from '../../hooks/useTheme';

const TEAL = '#4b9c78';
const DELETE_BTN_WIDTH = 80;

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy),
      onPanResponderMove: (_, { dx }) => {
        translateX.setValue(Math.max(Math.min(dx, 0), -DELETE_BTN_WIDTH));
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx < -50 || vx < -0.5) {
          Animated.spring(translateX, { toValue: -DELETE_BTN_WIDTH, useNativeDriver: true }).start();
          isOpen.current = true;
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          isOpen.current = false;
        }
      },
    }),
  ).current;

  function close() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    isOpen.current = false;
  }

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={swipeStyles.deleteAction}>
        <TouchableOpacity onPress={() => { close(); onDelete(); }} style={swipeStyles.deleteBtn} activeOpacity={0.8}>
          <Text style={swipeStyles.deleteBtnText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

type Conversation = {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  participantPhotos?: Record<string, string>;
  productTitle?: string | null;
  productPhoto?: string | null;
  lastMessage: string | null;
  lastMessageAt: any;
  lastMessageSenderId: string | null;
  unreadCount?: Record<string, number>;
};

function formatTime(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return d.toLocaleDateString('es-ES', { weekday: 'short' });
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}


export default function MessagesScreen() {
  const conversationsRef = useRef<Conversation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', uid),
      limit(20),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        console.log('[Messages] snapshot received, count:', snap.size, snap.docs.map((d) => d.id));
        const sorted = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Conversation))
          .sort((a, b) => {
            const ta = a.lastMessageAt?.toDate?.()?.getTime?.() ?? 0;
            const tb = b.lastMessageAt?.toDate?.()?.getTime?.() ?? 0;
            return tb - ta;
          });
        conversationsRef.current = sorted;
        setConversations(sorted);
        setLoading(false);
      },
      (err) => {
        console.error('[Messages] onSnapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  function handleDeleteConversation(conversationId: string) {
    Alert.alert(
      'Eliminar conversación',
      '¿Seguro que quieres eliminar esta conversación? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            deleteDoc(doc(db, 'conversations', conversationId)).catch((e) =>
              console.error('Error deleting conversation:', e),
            );
          },
        },
      ],
    );
  }

  function renderItem({ item }: { item: Conversation }) {
    const unread = uid ? (item.unreadCount?.[uid] ?? 0) : 0;
    const hasUnread = unread > 0;
    const displayTitle = item.productTitle ?? 'Conversación';
    const otherId = item.participants.find((p) => p !== uid);
    const otherPhoto = otherId ? (item.participantPhotos?.[otherId] ?? null) : null;
    const otherName = otherId ? (item.participantNames?.[otherId] ?? null) : null;
    const thumbPhoto = otherPhoto ?? item.productPhoto ?? null;

    return (
      <SwipeableRow onDelete={() => handleDeleteConversation(item.id)}>
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        activeOpacity={0.7}
        onPress={() => {
          console.log('[Messages] opening conversation:', item.id);
          router.push(`/chat/${item.id}`);
        }}
      >
        {thumbPhoto ? (
          <Image
            source={{ uri: thumbPhoto }}
            style={[styles.productThumb, otherPhoto ? styles.thumbRound : null]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.productThumbPlaceholder, styles.thumbRound]}>
            <Text style={styles.thumbInitial}>
              {otherName ? otherName[0].toUpperCase() : '?'}
            </Text>
          </View>
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.otherName, hasUnread && styles.otherNameBold, { color: colors.text }]} numberOfLines={1}>
              {displayTitle}
            </Text>
            <Text style={[styles.time, { color: colors.textLight }]}>{formatTime(item.lastMessageAt)}</Text>
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.lastMessage, hasUnread && styles.lastMessageBold, { color: colors.textLight }]}
              numberOfLines={1}
            >
              {item.lastMessage ?? 'Sin mensajes'}
            </Text>
            {hasUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      </SwipeableRow>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Mensajes</Text>
      </View>

      {loading && conversationsRef.current.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 }}>
              <MessageCircle size={52} color={colors.border} strokeWidth={1.5} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textLight, textAlign: 'center' }}>Aún no tienes conversaciones</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', letterSpacing: -0.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  productThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
    flexShrink: 0,
    backgroundColor: '#f3f4f6',
  },
  productThumbPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 10,
    flexShrink: 0,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRound: {
    borderRadius: 25,
  },
  thumbInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
  },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  otherName: { fontSize: 15, fontWeight: '500', color: '#111827', flex: 1, marginRight: 8 },
  otherNameBold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#9ca3af', flexShrink: 0 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMessage: { fontSize: 14, color: '#6b7280', flex: 1, marginRight: 8 },
  lastMessageBold: { color: '#111827', fontWeight: '600' },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 84 },
});

const swipeStyles = StyleSheet.create({
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BTN_WIDTH,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
