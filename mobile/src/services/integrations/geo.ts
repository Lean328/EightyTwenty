import * as ExpoLocation from 'expo-location';
import { Platform } from 'react-native';

export interface Coords {
  latitude: number;
  longitude: number;
}

/**
 * The phone's position for "Use my location" (nearest café first). Only asks iOS/Android for
 * permission when the customer turns the setting on; never tracks in the background.
 */
export const geo = {
  async granted(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return (await ExpoLocation.getForegroundPermissionsAsync()).granted;
  },
  async request(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return (await ExpoLocation.requestForegroundPermissionsAsync()).granted;
  },
  /** A recent position (a cached one is fine for sorting cafés), or null without permission. */
  async position(): Promise<Coords | null> {
    if (!(await geo.granted())) return null;
    const last = await ExpoLocation.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
    const fix = last ?? (await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }));
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  },
};

/** Great-circle distance in kilometres. */
export function distanceKm(a: Coords, b: Coords): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Cafés nearest first; cafés without coordinates keep their order after the located ones. */
export function nearestFirst<T extends { coords?: Coords | null }>(items: T[], here: Coords | null): T[] {
  if (!here) return items;
  const located = items.filter((i) => i.coords).sort((x, y) => distanceKm(here, x.coords!) - distanceKm(here, y.coords!));
  return [...located, ...items.filter((i) => !i.coords)];
}
