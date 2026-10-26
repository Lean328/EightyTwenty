import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { locationStatus } from '@/domain/hours';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { useGoToTab } from '@/navigation/tabNavigation';
import { errorMessage } from '@/services/errors';
import { colors, eyebrow, sans, serif } from '@/theme';
import { STATUS_COLORS, useChooseCafe, useLocations } from '../hooks';

/** The prototype features Phillip (100% gluten free) at the top of "Our cafés". */
const FEATURED_ID = 'phillip';

export function CafesScreen() {
  const now = useNow();
  const goToTab = useGoToTab();
  const choose = useChooseCafe();
  const bottom = useBottomSpace(132);
  const { data: locations = [], isError, error, refetch } = useLocations();
  const featured = locations.find((l) => l.id === FEATURED_ID);
  const others = locations.filter((l) => l.id !== FEATURED_ID);
  const fStatus = featured ? locationStatus(featured, now) : null;

  return (
    <Screen>
      <ScreenHeader title="Our cafés" />
      {isError ? <ErrorState message={errorMessage(error)} onRetry={refetch} /> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        {featured && fStatus ? (
          <>
            <Touchable onPress={() => router.push(`/cafes/${featured.id}`)} accessibilityLabel={`${featured.name}, ${fStatus.label}`} style={styles.featured}>
              <View style={styles.featuredPhoto}>
                {featured.image ? <Image source={featured.image} style={styles.fill} contentFit="cover" contentPosition={{ top: '48%', left: '50%' }} accessibilityLabel={`EightyTwenty ${featured.name}`} /> : null}
              </View>
              <View style={styles.featuredTitle}>
                <Text style={[serif(30, 400, 1), { color: colors.ink }]}>{featured.name}</Text>
                <Text style={[sans(12, 500), { color: STATUS_COLORS[fStatus.tone] }]}>{fStatus.label}</Text>
              </View>
              <Text style={[eyebrow(10, 0.12), styles.featuredSub]}>{featured.subtitle}</Text>
              <Text style={[sans(13, 400, 1.45), styles.featuredMeta]}>
                {featured.address} · {featured.hoursShort}
              </Text>
            </Touchable>
            <View style={styles.actions}>
              <Button
                label="Order here"
                onPress={() => {
                  choose(featured, { silent: true });
                  goToTab('menu');
                }}
                height={48}
                style={styles.flex}
              />
              <Button label="Book a table" variant="outline" onPress={() => router.push({ pathname: '/reserve', params: { locationId: featured.id } })} height={48} style={styles.flex} />
            </View>
          </>
        ) : null}
        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), styles.across]}>
          Across Canberra
        </Text>
        <View style={styles.grid}>
          {others.map((l) => {
            const s = locationStatus(l, now);
            return (
              <Touchable key={l.id} onPress={() => router.push(`/cafes/${l.id}`)} accessibilityLabel={`${l.name}, ${l.area}, ${s.label}`} style={styles.cell}>
                <View style={styles.square}>{l.image ? <Image source={l.image} style={styles.fill} contentFit="cover" /> : null}</View>
                <Text style={[serif(20, 400, 1.1), styles.cellName]}>{l.name}</Text>
                <Text style={[sans(12, 400, 1.3), styles.cellArea]}>{l.area}</Text>
                <Text style={[sans(12, 500, 1.3), { marginTop: 3, color: STATUS_COLORS[s.tone] }]}>{s.label}</Text>
              </Touchable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  featured: { marginTop: 8, marginHorizontal: 20 },
  featuredPhoto: { height: 236, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.linen },
  featuredTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 14 },
  featuredSub: { marginTop: 8, color: colors.caramelDeep },
  featuredMeta: { marginTop: 8, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 14, paddingHorizontal: 20 },
  across: { marginTop: 34, marginHorizontal: 20, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 20, paddingTop: 14, paddingHorizontal: 20 },
  cell: { width: '47.5%', flexGrow: 1, maxWidth: '50%' },
  square: { aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.linen },
  cellName: { marginTop: 9, color: colors.ink },
  cellArea: { marginTop: 3, color: colors.textSecondary },
});
