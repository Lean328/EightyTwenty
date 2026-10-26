import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Expo push notifications. The backend pushes every feed item (order status, stamps, booking
 * decisions, gift card top-ups, offers) to the phones registered with POST /me/push-tokens,
 * following the customer's notification toggles. Data: { kind, notificationId, url? }.
 *
 * Needs an EAS project id (`npx eas-cli@latest init` writes extra.eas.projectId to app.json).
 * Expo Go on Android has no remote push since SDK 53 — use a development build there.
 */
export interface PushData {
  kind?: string;
  notificationId?: string;
  url?: string;
}

// Show pushes as banners while the app is open too (the feed refreshes underneath).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let currentToken: string | null = null;

/** The token registered for this sign-in, removed again on sign-out. */
export const pushToken = {
  get: () => currentToken,
  set: (token: string | null) => {
    currentToken = token;
  },
};

/** Asks permission (once) and returns this phone's Expo push token, or null when push isn't possible. */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync('default', { name: 'EightyTwenty', importance: AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push notifications need an EAS project id: run `npx eas-cli@latest init` in mobile/.');
    return null;
  }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    // Offline, Expo Go on Android, or push credentials missing: the in-app feed still works.
    console.warn('Could not get a push token', e);
    return null;
  }
}

/** Calls `handler` when the customer taps a push — including the one that launched the app. */
export function onPushTap(handler: (data: PushData) => void): () => void {
  const last = Notifications.getLastNotificationResponse();
  if (last && last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    handler((last.notification.request.content.data ?? {}) as PushData);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    handler((response.notification.request.content.data ?? {}) as PushData);
    Notifications.clearLastNotificationResponse();
  });
  return () => sub.remove();
}

/** Calls `handler` when a push arrives while the app is open. */
export function onPushReceived(handler: (data: PushData) => void): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => handler((n.request.content.data ?? {}) as PushData));
  return () => sub.remove();
}
