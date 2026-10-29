import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { config } from '@/constants/config';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, PopText } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { ORDER_RULES } from '@/constants/business';
import { cardBalance } from '@/domain/loyalty';
import { stageIndex } from '@/domain/orders';
import { useLocation } from '@/features/locations/hooks';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useGoToTab } from '@/navigation/tabNavigation';
import { errorMessage } from '@/services/errors';
import { mapsUrl, openUrl } from '@/services/integrations/links';
import { colors, eyebrow, inkA, sans, serif } from '@/theme';
import type { Order } from '@/types';
import { firstNameOf, formatMoney, formatTimeOfDay } from '@/utils/format';
import { StageBars } from '../components/StageBars';
import { useOrder } from '../hooks';

const WORDS = ['Received.', 'Confirmed.', 'Preparing.', 'Ready.', 'Enjoy.'];

function stageLine(order: Order, stage: number, firstName: string): string {
  const loc = order.locationName;
  return [
    `Sent to ${loc} — they’ll confirm in a moment.`,
    `${loc} has your order and is getting started.`,
    'Being made fresh now. We’ll tell you the moment it’s ready.',
    order.method === 'Delivery' ? 'On its way to you now.' : `Waiting for you at the ${loc} counter.`,
    `Thanks, ${firstName} — see you next time.`,
  ][stage]!;
}

function instructions(order: Order): string {
  if (order.method === 'Pickup') return 'Collect at the counter — we’ll call your name.';
  if (order.method === 'Delivery') return `Delivering to ${order.deliveryAddress || 'your address'}.`;
  return `We’ll bring it to table ${order.tableNumber || '—'}.`;
}

/** Live order status: stage word, progress bars, ETA, where/when/paid, stamps earned. */
export function OrderStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goToTab = useGoToTab();
  const { data: order, isLoading, isError, error, refetch } = useOrder(id);
  const { data: location } = useLocation(order?.locationId);
  const { data: card } = useLoyaltyCard();
  const { data: profile } = useProfile();
  const home = () => goToTab('home');

  if (!order) {
    return (
      <Screen>
        {isError ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : isLoading ? null : <EmptyState icon="receipt" title="Order not found" actionLabel="Back to home" onAction={home} />}
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <Text style={[sans(13, 600), { color: colors.textSecondary }]}>{order.number}</Text>
      <Touchable onPress={home} accessibilityLabel="Close" style={styles.close}>
        <Icon name="close" size={20} strokeWidth={1.8} />
      </Touchable>
    </View>
  );

  if (order.status === 'declined') {
    return (
      <Screen>
        {header}
        <View style={styles.pad}>
          <Text style={[eyebrow(10, 0.12), { color: colors.danger }]}>Not accepted · {order.locationName}</Text>
          <Text accessibilityRole="header" style={[serif(36, 400, 1.05, -0.015), styles.h1]}>
            We couldn’t take this one.
          </Text>
          <Text style={[sans(15, 400, 1.5), styles.p]}>{order.locationName} wasn’t able to accept your order today. You haven’t been charged.</Text>
          {config.features.showPrices ? (
            <View style={styles.released}>
              <Text style={[sans(14, 400, 1.4), { color: colors.textSecondary }]}>Released to your card</Text>
              <Text style={[sans(14, 600, 1.4), { color: colors.ink }]}>{formatMoney(order.totals.total)}</Text>
            </View>
          ) : null}
          <Button label="Order from another café" onPress={() => goToTab('menu')} height={54} radius={14} fontSize={15} style={styles.mt20} />
          <Button label="Back to home" onPress={home} variant="outline" height={50} radius={14} style={[styles.mt8, { borderWidth: 0 }]} />
        </View>
      </Screen>
    );
  }

  const stage = Math.max(0, stageIndex(order.status));
  const wait = order.estimatedWait || ORDER_RULES.defaultWait;
  const eta = stage === 4 ? 'Completed' : stage === 3 ? (order.method === 'Delivery' ? 'Arriving now' : 'Ready now') : `Ready in about ${wait}`;
  const when = order.timing.type === 'asap' ? `ASAP · about ${wait}` : `${formatTimeOfDay(order.timing.time)} today`;
  const per = card?.stampsPerReward ?? 9;

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.padTight}>
          <Text style={[eyebrow(10, 0.12), { color: colors.textMuted }]}>
            {order.method} · {order.locationName}
          </Text>
          <View style={styles.mt12} accessibilityLiveRegion="polite">
            <PopText value={WORDS[stage]!} style={[serif(50, 400, 1, -0.02), { color: colors.ink }]} duration={400} />
          </View>
          <Text style={[sans(15, 400, 1.5), styles.p10]}>{stageLine(order, stage, firstNameOf(profile?.name ?? ''))}</Text>
          <StageBars stage={stage} />
          <View style={styles.eta}>
            <View style={styles.etaIcon}>
              <Icon name="clock" size={20} strokeWidth={1.7} />
            </View>
            <View style={styles.flex}>
              <Text style={[sans(15, 600, 1.3), { color: colors.ink }]}>{eta}</Text>
              <Text style={[sans(13, 400, 1.4), styles.sub]}>{instructions(order)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.photo}>{location?.image ? <Image source={location.image} style={styles.fill} contentFit="cover" /> : null}</View>
        <View style={styles.facts}>
          <Fact label="Where">
            <Text style={[sans(14, 400, 1.45), { color: colors.ink }]}>
              {location?.address ?? order.locationName} ·{' '}
              <Text style={[sans(14, 600, 1.45), { color: colors.caramelDeep }]} onPress={() => location && openUrl(mapsUrl(location.address))} accessibilityRole="link">
                Directions
              </Text>
            </Text>
          </Fact>
          <Fact label="When">
            <Text style={[sans(14, 400, 1.45), { color: colors.ink }]}>{when}</Text>
          </Fact>
          <Fact label="Paid">
            <Text style={[sans(14, 400, 1.45), { color: colors.ink }]}>
              {config.features.showPrices ? `${order.paymentLabel} · ${formatMoney(order.totals.total)}` : order.paymentLabel}
            </Text>
          </Fact>
        </View>
        {order.stampsEarned > 0 ? (
          <Rise delay={300} duration={400}>
            <Touchable onPress={() => goToTab('loyalty')} style={styles.earned}>
              <View style={styles.cup}>
                <Icon name="cupPlain" size={18} strokeWidth={1.7} color={colors.espresso} />
              </View>
              <Text style={[sans(13, 500, 1.35), styles.earnedText]}>
                You earned {order.stampsEarned} {order.stampsEarned === 1 ? 'coffee stamp' : 'coffee stamps'} · {cardBalance(card).shown} of {per}
              </Text>
              <Text style={[sans(13, 600), { color: colors.sand }]}>View card</Text>
            </Touchable>
          </Rise>
        ) : null}
        {order.rewardRedeemed ? <Text style={[sans(13, 500, 1.4), styles.redeemed]}>Free coffee redeemed on this order.</Text> : null}
        <View style={styles.lines}>
          {order.lines.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text style={[sans(13, 400, 1.4), { color: colors.textSecondary }]}>{l.qty}×</Text>
              <Text style={[sans(13, 400, 1.4), styles.flexInk]}>{l.name}</Text>
              {config.features.showPrices ? <Text style={[sans(13, 400, 1.4), { color: colors.ink }]}>{formatMoney(l.unitPrice * l.qty)}</Text> : null}
            </View>
          ))}
        </View>
        <Button label="Back to home" onPress={home} variant="outline" style={styles.back} />
      </ScrollView>
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={[sans(14, 400, 1.45), styles.factLabel]}>{label}</Text>
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexInk: { flex: 1, minWidth: 0, color: colors.ink },
  fill: { width: '100%', height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, paddingLeft: 20, paddingRight: 8 },
  close: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingTop: 12, paddingHorizontal: 20 },
  padTight: { paddingTop: 6, paddingHorizontal: 20 },
  scroll: { paddingBottom: 40 },
  h1: { marginTop: 12, color: colors.ink },
  p: { marginTop: 12, color: colors.ink },
  p10: { marginTop: 10, color: colors.ink },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt20: { marginTop: 20 },
  sub: { marginTop: 2, color: colors.textSecondary },
  released: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 20, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  eta: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  etaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center' },
  photo: { height: 180, marginTop: 12, marginHorizontal: 20, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.linen },
  facts: { gap: 10, marginTop: 18, marginHorizontal: 20 },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 76, color: colors.textMuted },
  earned: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginHorizontal: 20, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.espresso },
  cup: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  earnedText: { flex: 1, color: colors.creamText },
  redeemed: { marginTop: 12, marginHorizontal: 20, color: colors.caramelDeep },
  lines: { gap: 8, marginTop: 18, marginHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: inkA(0.08) },
  line: { flexDirection: 'row', gap: 8 },
  back: { marginTop: 22, marginHorizontal: 20 },
});
