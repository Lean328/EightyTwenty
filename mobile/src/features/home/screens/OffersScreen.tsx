import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { LOYALTY_RULES } from '@/constants/business';
import { stampsToGo } from '@/domain/loyalty';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useGoToTab } from '@/navigation/tabNavigation';
import { colors, creamA, eyebrow, sans, serif } from '@/theme';
import { useOffers } from '../hooks';

/** Short loyalty status line ("Three more for a free coffee." style, as in the prototype). */
export function stampsAwayLine(stamps: number, per: number = LOYALTY_RULES.stampsPerReward): string {
  const away = stampsToGo(stamps, per);
  if (!away) return 'Your free coffee is ready.';
  return away === 1 ? 'One more for a free coffee.' : `${away} more for a free coffee.`;
}

/** "What's on": current offers + the always-on coffee card. */
export function OffersScreen() {
  const goToTab = useGoToTab();
  const bottom = useBottomSpace(132);
  const { data: offers = [] } = useOffers();
  const { data: card } = useLoyaltyCard();
  return (
    <Screen>
      <ScreenHeader title="What's on" />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        {offers.map((o) => (
          <View key={o.id} style={styles.offer}>
            <View style={styles.photo}>{o.image ? <Image source={o.image} style={styles.fill} contentFit="cover" /> : null}</View>
            <Text style={[eyebrow(10, 0.12), styles.tag]}>{o.tag}</Text>
            <Text accessibilityRole="header" style={[serif(26, 400, 1.12, -0.01), styles.line]}>
              {o.line}
            </Text>
            <Text style={[sans(13, 400, 1.4), styles.fine]}>{o.fine}</Text>
            <Button label="Find a café" variant="outline" height={46} onPress={() => router.push('/cafes')} style={styles.find} />
          </View>
        ))}
        <Touchable onPress={() => goToTab('loyalty')} accessibilityLabel="Always on. Your 10th coffee is free." style={styles.loyalty}>
          <View style={styles.cup}>
            <Icon name="cup" size={24} strokeWidth={1.7} color={colors.espresso} />
          </View>
          <View style={styles.flex}>
            <Text style={[eyebrow(10, 0.14), { color: colors.sand }]}>Always on</Text>
            <Text style={[serif(21, 400, 1.15), styles.free]}>Your 10th coffee is free.</Text>
            <Text style={[sans(12, 400, 1.4), styles.away]}>{stampsAwayLine(card?.stamps ?? 0, card?.stampsPerReward)}</Text>
          </View>
        </Touchable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  offer: { marginTop: 8, marginHorizontal: 20 },
  photo: { height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.linen },
  tag: { marginTop: 14, color: colors.caramelDeep },
  line: { marginTop: 8, color: colors.ink },
  fine: { marginTop: 8, color: colors.textSecondary },
  find: { marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 18 },
  loyalty: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 30, marginHorizontal: 20, padding: 18, borderRadius: 16, backgroundColor: colors.espresso },
  cup: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' },
  free: { marginTop: 7, color: colors.creamText },
  away: { marginTop: 5, color: creamA(0.75) },
});
