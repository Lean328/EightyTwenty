import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ArrowLink } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { STATUS_DOTS, useLocationStatus } from '@/features/locations/hooks';
import { useGoToTab } from '@/navigation/tabNavigation';
import { colors, eyebrow, inkA, sans, serif } from '@/theme';
import type { Location } from '@/types';
import { streetLabel } from '../whatsOn';

/** The editorial "At Phillip" card: headline, status, Order ahead / View café, photo + vertical wordmark. */
export function FeaturedCafeCard({ location }: { location: Location }) {
  const status = useLocationStatus(location);
  const goToTab = useGoToTab();
  const view = () => router.push(`/cafes/${location.id}`);
  return (
    <View style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.at}>
          <View style={styles.slash} />
          <Text style={[eyebrow(10, 0.14), { color: colors.ink }]}>At {location.name}</Text>
        </View>
        <Text style={[serif(38, 400, 1.02, -0.022), styles.headline]}>{location.headline}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: STATUS_DOTS[status.tone] }]} />
          <Text style={[sans(13, 400, 1.3), styles.meta]}>
            {status.label.replace('· opens', '· Opens')}
            <Text style={{ opacity: 0.45 }}> · </Text>
            {streetLabel(location.address)}
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Order ahead" onPress={() => goToTab('menu')} height={42} radius={10} fontSize={13} style={styles.order} />
          <ArrowLink label="View café" onPress={view} color={colors.ink} />
        </View>
      </View>
      <View style={styles.bottom}>
        <Touchable onPress={view} pressedScale={1} pressedOpacity={0.9} accessibilityLabel={`View ${location.name} café`} style={styles.photo}>
          {location.image ? <Image source={location.image} style={styles.img} contentFit="cover" contentPosition={{ top: '46%', left: '50%' }} transition={200} /> : null}
        </Touchable>
        <View style={styles.vertical} aria-hidden>
          <Text style={[serif(21, 400, undefined, 0.01), styles.verticalText]}>
            EightyTwenty.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, marginHorizontal: 14, borderWidth: 1, borderColor: inkA(0.34), borderRadius: 20, backgroundColor: colors.parchment, overflow: 'hidden' },
  inner: { paddingTop: 18, paddingHorizontal: 18 },
  at: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slash: { width: 1, height: 12, backgroundColor: colors.brandRed, transform: [{ rotate: '18deg' }] },
  headline: { marginTop: 14, maxWidth: '88%', color: colors.ink },
  statusRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.textSecondary, flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 16 },
  order: { paddingHorizontal: 20 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 },
  photo: { flex: 1, height: 182, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: colors.imageWell },
  img: { width: '100%', height: '100%' },
  // writing-mode: vertical-rl → a 162×26 line rotated 90° about its centre, right-aligned so
  // the word ends 20pt above the bottom of the 66×182 column.
  vertical: { width: 66, height: 182 },
  verticalText: { position: 'absolute', width: 162, height: 26, lineHeight: 26, left: 33 - 81, top: 81 - 13, textAlign: 'right', color: colors.ink, transform: [{ rotate: '90deg' }] },
});
