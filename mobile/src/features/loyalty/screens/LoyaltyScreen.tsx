import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { Barcode } from '@/components/ui/Barcode';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { isRewardReady, stampsToGo } from '@/domain/loyalty';
import { useMenuStore } from '@/features/menu/menuStore';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { useTabReselect } from '@/hooks/useTabReselect';
import { useGoToTab } from '@/navigation/tabNavigation';
import { useUiStore } from '@/store/ui';
import { colors, eyebrow, fontFamilies, inkA, sans, serif, shadows } from '@/theme';
import { formatActivityTime } from '@/utils/datetime';
import { StampGrid } from '../components/StampGrid';
import { useLoyaltyActivity, useLoyaltyCard } from '../hooks';

const LOGO_BROWN = require('../../../../assets/branding/logo-stacked-brown.webp');
const LOGO_WHITE = require('../../../../assets/branding/logo-stacked-white.webp');

/** Coffee card: 9 stamps, Apple Wallet / Show card, free-coffee reward, recent activity. */
export function LoyaltyScreen() {
  const scroll = useRef<ScrollViewInstance>(null);
  const now = useNow();
  const goToTab = useGoToTab();
  const setCategory = useMenuStore((s) => s.setCategory);
  const { setWalletOpen, setMemberCardOpen } = useUiStore.getState();
  const newStamps = useUiStore((s) => s.newStamps);
  const rewardSeen = useUiStore((s) => s.rewardSeen);
  const { data: card } = useLoyaltyCard();
  const activity = useLoyaltyActivity();
  const [showAll, setShowAll] = useState(false);
  const bottom = useBottomSpace(28, true);
  useTabReselect('loyalty', () => scroll.current?.scrollTo({ y: 0, animated: true }));

  const per = card?.stampsPerReward ?? 9;
  const stamps = card?.stamps ?? 0;
  const ready = isRewardReady(stamps, per);
  const away = stampsToGo(stamps, per);

  // Leaving the tab settles the stamp animation (prototype `leaving()`).
  useFocusEffect(
    useCallback(
      () => () => useUiStore.getState().acknowledgeStamps(ready),
      [ready],
    ),
  );

  const history = activity.data?.pages.flatMap((p) => p.items) ?? [];
  const visible = showAll ? history : history.slice(0, 2);
  const redeemInApp = () => {
    setCategory('coffee');
    goToTab('menu');
  };

  return (
    <Screen>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: bottom }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (showAll && activity.hasNextPage && !activity.isFetchingNextPage && layoutMeasurement.height + contentOffset.y > contentSize.height - 200) void activity.fetchNextPage();
        }}
        scrollEventThrottle={64}
      >
        <Rise style={styles.brand}>
          <Image source={LOGO_BROWN} style={styles.logo} contentFit="contain" accessibilityLabel="eighty twenty" />
          <View style={styles.cardLabel}>
            <View style={styles.rule} />
            <Text style={[eyebrow(10, 0.2), { color: colors.ink }]}>Coffee card</Text>
            <View style={styles.rule} />
          </View>
        </Rise>

        <Rise delay={50} style={styles.card}>
          <View style={styles.handle} />
          <View style={styles.countRow}>
            <View>
              <Text accessibilityRole="header" style={[serif(30, 400, 1, -0.02), { color: colors.ink }]}>
                {stamps} of {per}
              </Text>
              <Text style={[sans(13, 400, 1.2), styles.toGo]}>{ready ? 'Free coffee ready' : away === 1 ? '1 coffee to go' : `${away} coffees to go`}</Text>
            </View>
            <Text style={[sans(12), { color: colors.textMuted, paddingBottom: 2 }]}>1 coffee = 1 stamp</Text>
          </View>
          <StampGrid stamps={stamps} perReward={per} newStamps={newStamps} rewardSeen={rewardSeen} onRewardPress={() => setMemberCardOpen(true)} />
          <View style={styles.actions}>
            <View style={[styles.notch, { left: -26 }]} />
            <View style={[styles.notch, { right: -26 }]} />
            <Touchable onPress={() => setWalletOpen(true)} pressedOpacity={0.85} accessibilityLabel={card?.walletPassAdded ? 'Apple Wallet, pass added' : 'Add to Apple Wallet'} style={styles.wallet}>
              <View style={styles.walletIcon}>
                <View style={[styles.wb, { height: 4, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: colors.sand }]} />
                <View style={[styles.wb, { height: 4, backgroundColor: colors.caramel }]} />
                <View style={[styles.wb, { height: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.espresso }]} />
              </View>
              <Text style={[sans(14, 600), { color: colors.ink }]}>Apple Wallet</Text>
            </Touchable>
            <Touchable onPress={() => setMemberCardOpen(true)} pressedOpacity={0.85} style={styles.show}>
              <Icon name="barcode" size={18} strokeWidth={1.8} color={colors.espresso} />
              <Text style={[sans(14, 600), { color: colors.espresso }]}>Show card</Text>
            </Touchable>
          </View>
        </Rise>

        {ready ? (
          <Rise delay={300} duration={400} style={styles.reward}>
            <View style={styles.rewardTop}>
              <Image source={LOGO_WHITE} style={styles.logoWhite} contentFit="contain" accessibilityLabel="eighty twenty" />
            </View>
            <View style={styles.rewardBody}>
              <View style={styles.rewardCup}>
                <Icon name="cup" size={26} strokeWidth={1.6} color={colors.caramel} />
              </View>
              <Text style={[serif(28, 400, 1, -0.015), styles.rewardTitle]}>Free coffee</Text>
              <Text style={[sans(13, 400, 1.3), styles.rewardSub]}>Any coffee, any size.</Text>
              <View style={styles.rewardCode}>
                <Barcode height={56} />
                <Text style={[styles.number, { fontFamily: fontFamilies.mono }]}>{card?.memberNumber}</Text>
              </View>
              <View style={styles.rewardActions}>
                <Button label="Redeem in app" onPress={redeemInApp} height={46} fontSize={13} style={styles.flex} />
                <Button label="Show at counter" variant="outline" onPress={() => setMemberCardOpen(true)} height={46} fontSize={13} style={[styles.flex, { borderColor: inkA(0.22) }]} />
              </View>
            </View>
          </Rise>
        ) : null}

        <Rise delay={100} duration={380} style={styles.recent}>
          <View style={styles.recentHead}>
            <Text accessibilityRole="header" style={[serif(20, 400, 1, -0.01), { color: colors.ink }]}>
              Recent
            </Text>
            {history.length > 2 ? <TextAction label={showAll ? 'Show less' : 'History'} onPress={() => setShowAll((v) => !v)} /> : null}
          </View>
          {activity.isLoading ? (
            <View style={styles.skelRow}>
              <Skeleton style={styles.skelDot} />
              <Skeleton delay={100} style={styles.skelLine} />
            </View>
          ) : (
            visible.map((h) => (
              <View key={h.id} style={styles.row} accessible accessibilityLabel={`${h.description}, ${h.locationName}, ${formatActivityTime(h.occurredAt, now)}`}>
                <View style={[styles.rowIcon, { backgroundColor: h.type === 'earn' ? colors.espresso : colors.caramel }]}>
                  <Icon name="cup" size={14} strokeWidth={1.8} color={h.type === 'earn' ? colors.creamText : colors.ink} />
                </View>
                <Text numberOfLines={1} style={[sans(13.5, 500, 1.3), styles.rowText]}>
                  {h.description}
                </Text>
                <Text style={[sans(12, 400, 1.3), { color: colors.textMuted }]}>
                  {h.locationName} · {formatActivityTime(h.occurredAt, now)}
                </Text>
              </View>
            ))
          )}
        </Rise>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  brand: { alignItems: 'center', paddingTop: 22, paddingHorizontal: 20 },
  logo: { width: 118, height: 84 },
  cardLabel: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  rule: { width: 26, height: 1, backgroundColor: colors.ink },
  card: { marginTop: 20, marginHorizontal: 14, paddingTop: 10, paddingHorizontal: 18, borderRadius: 28, backgroundColor: colors.ivory, ...shadows.loyaltyCard },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: inkA(0.6) },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 18 },
  toGo: { marginTop: 6, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4, paddingTop: 16, paddingBottom: 18, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: inkA(0.22) },
  notch: { position: 'absolute', top: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.cream },
  wallet: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, backgroundColor: colors.oat },
  walletIcon: { gap: 1.5 },
  wb: { width: 16 },
  show: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, borderColor: colors.espresso },
  reward: { marginTop: 18, marginHorizontal: 14, borderRadius: 20, overflow: 'hidden', ...shadows.loyaltyCard },
  rewardTop: { height: 92, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.charcoalSoft },
  logoWhite: { height: 42, width: 61 },
  rewardBody: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: colors.ivory, alignItems: 'center' },
  rewardCup: { width: 54, height: 54, marginTop: -45, borderRadius: 27, backgroundColor: colors.cream, borderWidth: 4, borderColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { marginTop: 10, color: colors.ink },
  rewardSub: { marginTop: 6, color: colors.textSecondary },
  rewardCode: { alignSelf: 'stretch', marginTop: 14 },
  number: { marginTop: 8, fontSize: 13, fontWeight: '600', letterSpacing: 2.1, color: colors.ink, textAlign: 'center' },
  rewardActions: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 16 },
  recent: { marginTop: 22, marginHorizontal: 20 },
  recentHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingVertical: 10 },
  skelDot: { width: 30, height: 30, borderRadius: 15 },
  skelLine: { width: '58%', height: 12, borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: inkA(0.08) },
  rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, color: colors.ink },
});
