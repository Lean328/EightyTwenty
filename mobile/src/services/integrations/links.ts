import { Linking } from 'react-native';

/**
 * Device hand-offs: email drafts (bookings & catering use the café inboxes today),
 * phone calls, SMS and maps. Each resolves to `false` when the device can't handle it
 * (e.g. no mail account on a simulator) so the UI can stay on its success state.
 */
async function open(url: string): Promise<boolean> {
  try {
    // openURL rejects when nothing can handle the URL. (canOpenURL is avoided: on iOS it
    // needs every scheme whitelisted in LSApplicationQueriesSchemes.)
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export const openEmailDraft = (mailto: string) => open(mailto);
export const openPhone = (phone: string) => open(`tel:${phone.replace(/\s/g, '')}`);
export const openSms = (phone: string) => open(`sms:${phone.replace(/\s/g, '')}`);
export const openUrl = (url: string) => open(url);

export function mapsUrl(address: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('EightyTwenty ' + address);
}
