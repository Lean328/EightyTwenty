import { router } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { Icon } from '@/components/ui/Icon';
import { ArrowLink } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useSignOut } from '@/features/auth/hooks';
import { useCateringEnquiries } from '@/features/catering/hooks';
import { useGiftCard } from '@/features/gift-cards/hooks';
import { useSelectedLocation } from '@/features/locations/hooks';
import { showWalletFor, useLoyaltyCard } from '@/features/loyalty/hooks';
import { useOrderHistory } from '@/features/orders/hooks';
import { useReservations } from '@/features/reservations/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useTabReselect } from '@/hooks/useTabReselect';
import { useUiStore } from '@/store/ui';
import { colors, eyebrow, serif } from '@/theme';
import { formatMonthYear, toISODate } from '@/utils/datetime';
import { firstNameOf, formatMoney, lastNameOf } from '@/utils/format';
import { Avatar } from '../components/Avatar';
import { SettingsGroup, SettingsRow } from '../components/SettingsGroup';
import { useAddresses, useFavourites, usePaymentMethods, usePreferences, useProfile } from '../hooks';

/** Account hub: name + avatar, then General · Payment & wallet · Preferences · Support. */
export function ProfileScreen() {
  const scroll = useRef<ScrollViewInstance>(null);
  const signOut = useSignOut();
  const { openCafePicker, setWalletOpen, setAvatarOpen } = useUiStore.getState();
  const location = useSelectedLocation();
  const { data: profile } = useProfile();
  const { data: prefs } = usePreferences();
  const { data: cards = [] } = usePaymentMethods();
  const { data: favourites = [] } = useFavourites();
  const { data: addresses = [] } = useAddresses();
  const { data: gift } = useGiftCard();
  const { data: card } = useLoyaltyCard();
  const { data: reservations = [] } = useReservations();
  const { data: enquiries = [] } = useCateringEnquiries();
  const orders = useOrderHistory();
  const bottom = useBottomSpace(28, true);
  useTabReselect('profile', () => scroll.current?.scrollTo({ y: 0, animated: true }));

  const name = profile?.name ?? '';
  const today = toISODate(new Date());
  const upcoming = reservations.filter((r) => r.date >= today).length;
  const orderCount = orders.data?.pages.reduce((n, p) => n + p.items.length, 0) ?? 0;
  const notifOn = prefs ? Object.values(prefs.notifications).filter(Boolean).length : 0;
  const notifTotal = prefs ? Object.keys(prefs.notifications).length : 0;

  return (
    <Screen shieldColor={colors.oat}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Rise style={styles.head}>
          <View style={styles.headText}>
            <Text style={[eyebrow(10, 0.14), { color: colors.caramelDeep }]}>Member since {profile ? formatMonthYear(profile.memberSince) : ''}</Text>
            <Text accessibilityRole="header" style={[serif(38, 400, 0.98, -0.025), styles.name]}>
              {firstNameOf(name)}
              {lastNameOf(name) ? '\n' + lastNameOf(name) : ''}
            </Text>
            <ArrowLink label="Edit profile" color={colors.ink} onPress={() => router.push('/account/edit')} style={styles.edit} />
          </View>
          <Touchable onPress={() => setAvatarOpen(true)} accessibilityLabel="Change profile icon" style={styles.avatarBtn}>
            <Avatar index={prefs?.avatar ?? 0} name={name} size={56} />
            <View style={styles.pencil}>
              <Icon name="pencil" size={11} strokeWidth={2.2} />
            </View>
          </Touchable>
        </Rise>

        <View style={styles.firstGroup}>
          <SettingsGroup title="General">
            <SettingsRow icon="person" label="Edit profile" onPress={() => router.push('/account/edit')} />
            <SettingsRow icon="receipt" label="Order history" detail={`${orderCount} past`} onPress={() => router.push({ pathname: '/account/activity', params: { segment: 'orders' } })} />
            <SettingsRow icon="calendar" label="Reservations" detail={upcoming ? `${upcoming} upcoming` : 'None upcoming'} onPress={() => router.push({ pathname: '/account/activity', params: { segment: 'reservations' } })} />
            <SettingsRow icon="catering" label="Catering" detail={enquiries.length ? `${enquiries.length} open` : 'Plan an event'} onPress={() => router.push({ pathname: '/account/activity', params: { segment: 'catering' } })} />
            <SettingsRow icon="bell" label="Notifications" detail={`${notifOn} of ${notifTotal} on`} onPress={() => router.push('/notifications/settings')} />
            <SettingsRow icon="shield" label="Privacy & security" onPress={() => router.push('/account/privacy')} />
          </SettingsGroup>
        </View>
        <SettingsGroup title="Payment & wallet">
          <SettingsRow icon="card" label="Payment methods" detail={'Apple Pay' + (cards[0] ? ` · ${cards[0].brand} ·· ${cards[0].last4}` : '')} onPress={() => router.push('/account/payment-methods')} />
          <SettingsRow icon="gift" label="Gift cards" detail={formatMoney(gift?.balance ?? 0)} onPress={() => router.push('/account/gift-cards')} />
          {showWalletFor(card) ? <SettingsRow icon="wallet" label="Apple Wallet" detail={card?.walletPassAdded ? 'Pass added' : 'Not added'} onPress={() => setWalletOpen(true)} /> : null}
        </SettingsGroup>
        <SettingsGroup title="Preferences">
          <SettingsRow icon="pin" label="Home café" detail={location?.name} onPress={() => openCafePicker()} />
          <SettingsRow icon="leaf" label="Dietary" detail={prefs?.dietary.length ? prefs.dietary.join(', ') : 'None set'} onPress={() => router.push('/account/preferences')} />
          <SettingsRow icon="heart" label="Favourites" detail={favourites.length ? `${favourites.length} saved` : 'None yet'} onPress={() => router.push('/account/favourites')} />
          <SettingsRow icon="home" label="Saved addresses" detail={addresses.length ? `${addresses.length} saved` : 'None yet'} onPress={() => router.push('/account/preferences')} />
        </SettingsGroup>
        <SettingsGroup title="Support">
          <SettingsRow icon="help" label="Help centre" onPress={() => router.push('/account/help')} />
          <SettingsRow icon="chat" label="Contact your café" onPress={() => router.push('/account/help')} />
          <SettingsRow icon="document" label="Terms & privacy" onPress={() => router.push('/account/privacy')} />
          <SettingsRow icon="signOut" label="Sign out" danger onPress={() => void signOut()} />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingTop: 12, paddingHorizontal: 20 },
  headText: { flex: 1, minWidth: 0, paddingTop: 4 },
  name: { marginTop: 12, color: colors.ink },
  edit: { marginTop: 8 },
  avatarBtn: { marginTop: 2, width: 56, height: 56 },
  pencil: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  firstGroup: { marginTop: 6 },
});
