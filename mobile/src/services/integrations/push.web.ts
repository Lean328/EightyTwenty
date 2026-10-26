/** Web QA build: no push notifications (the in-app feed still works). Same API as push.ts. */
export interface PushData {
  kind?: string;
  notificationId?: string;
  url?: string;
}

let currentToken: string | null = null;

export const pushToken = {
  get: () => currentToken,
  set: (token: string | null) => {
    currentToken = token;
  },
};

export async function getPushToken(): Promise<string | null> {
  return null;
}

export function onPushTap(_handler: (data: PushData) => void): () => void {
  return () => undefined;
}

export function onPushReceived(_handler: (data: PushData) => void): () => void {
  return () => undefined;
}
