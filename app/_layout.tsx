import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router, SplashScreen } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { auth, db } from '../lib/firebase';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerPushToken(uid: string) {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await setDoc(doc(db, 'users', uid), { expoPushToken: tokenData.data }, { merge: true });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch (e) {
    console.error('Error registering push token:', e);
  }
}

export default function RootLayout() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_seen').then((val) => {
      setOnboardingSeen(val === 'true');
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) registerPushToken(u.uid);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, string | undefined>;
      const type = data?.type;
      const relatedId = data?.relatedId;

      switch (type) {
        case 'new_request':
          router.push('/requests' as any);
          break;
        case 'request_approved':
        case 'deposit_pending':
        case 'payment_confirmed':
          router.push('/my-rentals' as any);
          break;
        case 'new_message': {
          const convId = data?.conversationId || relatedId;
          router.push((convId ? `/chat/${convId}` : '/notifications') as any);
          break;
        }
        case 'review_pending':
        case 'rental_completed': {
          const rentalId = data?.rentalId || relatedId;
          router.push((rentalId ? `/review/${rentalId}` : '/notifications') as any);
          break;
        }
        case 'verification_approved':
        case 'verification_rejected':
          router.push('/verification' as any);
          break;
        case 'dispute_opened':
        case 'deposit_retained': {
          const disputeId = data?.disputeId || relatedId;
          router.push((disputeId ? `/dispute/${disputeId}` : '/notifications') as any);
          break;
        }
        default:
          router.push('/notifications' as any);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (user === undefined || onboardingSeen === undefined) return;
    SplashScreen.hideAsync();
    if (!onboardingSeen) {
      router.replace('/onboarding');
    } else if (user) {
      router.replace('/(tabs)/');
    } else {
      router.replace('/(auth)/login');
    }
  }, [user, onboardingSeen]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
