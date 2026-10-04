import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { ChevronLeft, Send, Paperclip, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { db, auth, storage } from '../../lib/firebase';

const TEAL = '#4b9c78';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Message = {
  id: string;
  senderId: string;
  text: string;
  type?: string;
  imageUrl?: string;
  createdAt: any;
};

function formatTime(ts: any): string {
  if (!ts) return '';
  const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [otherName, setOtherName] = useState('Chat');
  const [otherPhoto, setOtherPhoto] = useState<string | null>(null);
  const [productPhoto, setProductPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve current user and other participant's name
  useEffect(() => {
    console.log('[Chat] mounted, conversationId:', conversationId);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/(auth)/login'); return; }
      setUid(user.uid);

      try {
        console.log('[Chat] fetching conversation doc:', conversationId);
        const convSnap = await getDoc(doc(db, 'conversations', conversationId));
        if (!convSnap.exists()) {
          console.warn('[Chat] conversation not found:', conversationId);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = convSnap.data();
        const participants: string[] = data.participants ?? [];
        const otherId = participants.find((p) => p !== user.uid);
        if (data.participantNames && otherId) {
          setOtherName(data.participantNames[otherId] ?? 'Usuario');
        }
        if (otherId && data.participantPhotos?.[otherId]) {
          setOtherPhoto(data.participantPhotos[otherId]);
        }
        if (data.productPhoto) setProductPhoto(data.productPhoto);
      } catch (e) {
        console.error('[Chat] error loading conversation:', e);
      }
    });
    return unsub;
  }, [conversationId]);

  // Real-time messages listener + mark as read
  useEffect(() => {
    if (!conversationId || !uid) return;
    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message)));
      setLoading(false);
      // Reset unread count for current user
      updateDoc(doc(db, 'conversations', conversationId), {
        [`unreadCount.${uid}`]: 0,
      }).catch(() => {});
    });
    return unsub;
  }, [conversationId, uid]);

  // Real-time typing indicator listener
  useEffect(() => {
    if (!conversationId || !uid) return;
    const unsub = onSnapshot(doc(db, 'conversations', conversationId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const participants: string[] = data.participants ?? [];
      const otherParticipantId = participants.find((p) => p !== uid);
      if (otherParticipantId) {
        setOtherTyping(data.typing?.[otherParticipantId] === true);
      }
    });
    return () => {
      unsub();
      // Clear own typing status on unmount
      updateDoc(doc(db, 'conversations', conversationId), {
        [`typing.${uid}`]: false,
      }).catch(() => {});
    };
  }, [conversationId, uid]);

  function handleTextChange(val: string) {
    setText(val);
    if (!uid || !conversationId) return;

    if (val.trim()) {
      updateDoc(doc(db, 'conversations', conversationId), {
        [`typing.${uid}`]: true,
      }).catch(() => {});
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      updateDoc(doc(db, 'conversations', conversationId), {
        [`typing.${uid}`]: false,
      }).catch(() => {});
    }, 2000);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !uid || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);
    setText('');

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    updateDoc(doc(db, 'conversations', conversationId), {
      [`typing.${uid}`]: false,
    }).catch(() => {});

    try {
      const now = Timestamp.now();
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderId: uid,
        text: trimmed,
        createdAt: now,
      });
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: trimmed,
        lastMessageAt: now,
        lastMessageSenderId: uid,
      });
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      setSending(false);
    }
  }

  async function handlePickImage() {
    if (!uid) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingImage(true);
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const fileRef = storageRef(storage, `conversations/${conversationId}/media/${Date.now()}`);
      await uploadBytes(fileRef, blob);
      const imageUrl = await getDownloadURL(fileRef);

      const now = Timestamp.now();
      await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
        senderId: uid,
        text: '',
        type: 'image',
        imageUrl,
        createdAt: now,
      });
      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: 'Imagen',
        lastMessageAt: now,
        lastMessageSenderId: uid,
      });
    } catch (e) {
      console.error('Error sending image:', e);
    } finally {
      setUploadingImage(false);
    }
  }

  function renderItem({ item }: { item: Message }) {
    const isOwn = item.senderId === uid;

    if (item.type === 'image' && item.imageUrl) {
      return (
        <View style={[styles.bubbleWrapper, isOwn ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft]}>
          <TouchableOpacity onPress={() => setViewingImage(item.imageUrl!)} activeOpacity={0.9}>
            <Image source={{ uri: item.imageUrl }} style={[styles.imageBubble, isOwn ? styles.imageBubbleOwn : styles.imageBubbleOther]} resizeMode="cover" />
          </TouchableOpacity>
          <Text style={[styles.timeText, isOwn ? styles.timeRight : styles.timeLeft]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.bubbleWrapper, isOwn ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft]}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
            {item.text}
          </Text>
        </View>
        <Text style={[styles.timeText, isOwn ? styles.timeRight : styles.timeLeft]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.headerName}>Chat</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Conversación no encontrada</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <ChevronLeft size={22} color="#111827" strokeWidth={2.5} />
        </TouchableOpacity>
        {otherPhoto ? (
          <Image source={{ uri: otherPhoto }} style={styles.headerAvatar} resizeMode="cover" />
        ) : productPhoto ? (
          <Image source={{ uri: productPhoto }} style={styles.headerPhoto} resizeMode="cover" />
        ) : (
          <View style={styles.headerAvatarPlaceholder}>
            <Text style={styles.headerAvatarInitial}>{otherName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerName} numberOfLines={1}>{otherName}</Text>
          {otherTyping && <Text style={styles.typingText}>escribiendo...</Text>}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>Empieza la conversación</Text>
            </View>
          }
        />
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={handlePickImage}
          disabled={uploadingImage}
          style={styles.clipBtn}
          activeOpacity={0.7}
          hitSlop={8}
        >
          {uploadingImage
            ? <ActivityIndicator size="small" color={TEAL} />
            : <Paperclip size={20} color="#9ca3af" strokeWidth={2} />}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Escribe un mensaje..."
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={handleTextChange}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Send size={18} color="#fff" strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={!!viewingImage} transparent animationType="fade" onRequestClose={() => setViewingImage(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setViewingImage(null)}>
          {viewingImage && (
            <Image source={{ uri: viewingImage }} style={styles.modalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.modalClose} onPress={() => setViewingImage(null)}>
            <X size={24} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { padding: 4 },
  headerPhoto: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f3f4f6' },
  headerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f3f4f6' },
  headerAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitial: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  headerTextContainer: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: '700', color: '#111827', letterSpacing: -0.3 },
  typingText: { fontSize: 12, color: TEAL, marginTop: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  listContent: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  bubbleWrapper: { marginBottom: 12, maxWidth: '80%' },
  bubbleWrapperRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapperLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleOwn: { backgroundColor: TEAL, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: '#111827' },
  imageBubble: { width: 200, height: 200, borderRadius: 14 },
  imageBubbleOwn: { borderBottomRightRadius: 4 },
  imageBubbleOther: { borderBottomLeftRadius: 4 },
  timeText: { fontSize: 11, color: '#9ca3af', marginTop: 3 },
  timeRight: { marginRight: 2 },
  timeLeft: { marginLeft: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  clipBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.75,
  },
  modalClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
  },
});
