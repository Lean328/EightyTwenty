import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { config } from '@/constants/config';
import { isComingSoon } from '@/domain/hours';
import { useCateringPackages } from '@/features/catering/hooks';
import { useLocations, useSelectedLocation } from '@/features/locations/hooks';
import { useMenu } from '@/features/menu/hooks';
import { useNotificationFeed } from '@/features/notifications/hooks';
import { useLiveOrder } from '@/features/orders/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { useTabReselect } from '@/hooks/useTabReselect';
import { useGoToTab } from '@/navigation/tabNavigation';
import { STATUS_LABEL } from '@/domain/orders';
import { colors, sans, serif } from '@/theme';
import { formatRelativeShort } from '@/utils/datetime';
import { firstNameOf } from '@/utils/format';
import { FeaturedCafeCard } from '../components/FeaturedCafeCard';
import { GiftCardBanner } from '../components/GiftCardBanner';
import { HomeHeader } from '../components/HomeHeader';
import { CafeRail, KitchenRail } from '../components/HomeRails';
import { SectionHeading } from '../components/SectionHeading';
import { WhatsOnSection } from '../components/WhatsOnSection';
import { useOffers } from '../hooks';
import { buildWhatsOn, greeting, LATEST_SHORT, leadSubline } from '../whatsOn';

/** Home — the approved editorial layout, section order preserved. */
export function HomeScreen() {
  const scroll = useRef<ScrollViewInstance>(null);
  const now = useNow();
  const goToTab = useGoToTab();
  const location = useSelectedLocation();
  const { data: profile } = useProfile();
  const { data: locations = [] } = useLocations();
  const { data: offers = [] } = useOffers();
  const { data: packages = [] } = useCateringPackages();
  const { data: menu = [] } = useMenu();
  const { data: feed } = useNotificationFeed();
  const bottom = useBottomSpace(8, true);
  useTabReselect('home', () => scroll.current?.scrollTo({ y: 0, animated: true }));

  const whatsOn = useMemo(() => buildWhatsOn(offers, locations, packages), [offers, locations, packages]);
  const cafes = useMemo(() => locations.filter((l) => l.id !== location?.id && !isComingSoon(l)), [locations, location?.id]);
  const kitchen = useMemo(() => menu.filter((m) => m.featured && m.image).slice(0, 6), [menu]);
  const latest = feed?.unseen[0];
  const liveOrder = useLiveOrder();

  return (
    <Screen>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <HomeHeader cafeName={location?.name ?? '…'} unseenCount={feed?.unseen.length ?? 0} />
        <Rise style={styles.titleWrap}>
          <Text accessibilityRole="header" style={[serif(31, 400, 1.05, -0.02), { color: colors.ink }]}>
            {greeting(now.getHours())}, {firstNameOf(profile?.name ?? '')}
          </Text>
        </Rise>
        {liveOrder ? (
          // The way back to an order in progress once its push or status screen is closed.
          <Rise delay={70} style={styles.latestWrap}>
            <Touchable onPress={() => router.push(`/orders/${liveOrder.id}`)} pressedOpacity={0.85} accessibilityLabel={`Order ${liveOrder.number}, ${STATUS_LABEL[liveOrder.status]}. Track your order`} style={styles.latest}>
              <View style={styles.latestIcon}>
                <Icon name="receipt" size={13} strokeWidth={2} color={colors.creamText} />
              </View>
              <Text numberOfLines={1} style={[sans(13, 500, 1.2), styles.latestText]}>
                {STATUS_LABEL[liveOrder.status]} · {liveOrder.locationName}
              </Text>
              <Text style={[sans(12, 500), { color: colors.caramelDeep }]}>Track</Text>
            </Touchable>
          </Rise>
        ) : null}
        {latest ? (
          <Rise delay={70} style={styles.latestWrap}>
            <Touchable onPress={() => router.push('/notifications')} pressedOpacity={0.85} accessibilityLabel={`${latest.kind}: ${latest.text}`} style={styles.latest}>
              <View style={styles.latestIcon}>
                <Icon name="bell" size={13} strokeWidth={2} color={colors.creamText} />
              </View>
              <Text numberOfLines={1} style={[sans(13, 500, 1.2), styles.latestText]}>
                {/* Real feed lines say what happened (confirmed, declined…); the short labels fit the mock's fixed events. */}
                {config.dataSource === 'api' ? latest.text : (LATEST_SHORT[latest.kind] ?? latest.text)}
              </Text>
              <Text style={[sans(12, 500), { color: colors.caramelDeep }]}>{formatRelativeShort(latest.createdAt, now)}</Text>
            </Touchable>
          </Rise>
        ) : null}

        {location ? (
          <Rise delay={60}>
            <FeaturedCafeCard location={location} />
          </Rise>
        ) : null}

        {whatsOn.length ? (
          <Rise delay={80} duration={380}>
            <WhatsOnSection items={whatsOn} leadSub={leadSubline(whatsOn[0], offers)} />
          </Rise>
        ) : null}

        <GiftCardBanner />

        <View style={styles.band}>
          <View style={styles.gutter}>
            <SectionHeading number="02" title="Our cafés" actionLabel="See all" onAction={() => router.push('/cafes')} />
          </View>
          {cafes.length ? <CafeRail locations={cafes} /> : null}
          <View style={[styles.gutter, styles.kitchenHead]}>
            <SectionHeading number="03" title="From the kitchen" actionLabel="Full menu" onAction={() => goToTab('menu')} />
          </View>
          {kitchen.length ? <KitchenRail items={kitchen} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleWrap: { paddingTop: 10, paddingHorizontal: 20 },
  latestWrap: { paddingTop: 12, paddingHorizontal: 20, alignItems: 'flex-start' },
  latest: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%', paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: 999, backgroundColor: colors.linen },
  latestIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  latestText: { flexShrink: 1, color: colors.ink },
  band: { marginTop: 30, paddingTop: 20, paddingBottom: 22, backgroundColor: colors.oat },
  gutter: { paddingHorizontal: 20 },
  kitchenHead: { marginTop: 26 },
});
