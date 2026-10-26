import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { locationStatus } from '@/domain/hours';
import { STATUS_COLORS } from '@/features/locations/hooks';
import { useNow } from '@/hooks/useNow';
import { useUiStore } from '@/store/ui';
import { colors, inkA, ivoryA, sans, serif } from '@/theme';
import type { Location, MenuItem } from '@/types';
import { pad2 } from '@/utils/format';
import { Rail } from './Rail';

const pos = (i: number, n: number) => `${pad2(i + 1)} / ${pad2(n)}`;

/** "02 Our cafés" — framed photo cards that wipe in. */
export function CafeRail({ locations }: { locations: Location[] }) {
  const now = useNow();
  return (
    <Rail
      items={locations}
      mode="wipe"
      height={226}
      keyOf={(l) => l.id}
      style={styles.cafeRail}
      renderSlide={(l, i, anim) => {
        const status = locationStatus(l, now);
        return (
          <Touchable onPress={() => router.push(`/cafes/${l.id}`)} pressedScale={0.985} pressedOpacity={1} accessibilityLabel={`${l.name}, ${status.label}`} style={styles.cafeCard}>
            <View style={styles.cafePhoto}>
              <Animated.View style={[StyleSheet.absoluteFill, anim.image]}>
                {l.image ? <Image source={l.image} style={styles.fill} contentFit="cover" /> : null}
              </Animated.View>
              <View style={styles.pos}>
                <Text style={[sans(10, 600, undefined, 0.1), { color: colors.ink }]}>{pos(i, locations.length)}</Text>
              </View>
            </View>
            <Animated.View style={[styles.cafeCaption, anim.caption]}>
              <Text style={[serif(22, 400, 1.1, -0.012), { color: colors.ink }]}>{l.name}</Text>
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: STATUS_COLORS[status.tone] }]} />
                <Text style={[sans(11.5, 500), { color: STATUS_COLORS[status.tone] }]}>{status.label}</Text>
              </View>
            </Animated.View>
          </Touchable>
        );
      }}
    />
  );
}

/** "03 From the kitchen" — featured dishes crossfading with a slow zoom. */
export function KitchenRail({ items }: { items: MenuItem[] }) {
  const openItem = useUiStore((s) => s.openItem);
  return (
    <Rail
      items={items}
      mode="fade"
      height={214}
      keyOf={(m) => m.id}
      style={styles.kitchenRail}
      renderSlide={(m, _i, anim) => (
        <Touchable onPress={() => openItem(m)} pressedScale={0.985} pressedOpacity={1} accessibilityLabel={m.name} style={StyleSheet.absoluteFill}>
          <View style={styles.kitchenPhoto}>
            <Animated.View style={[StyleSheet.absoluteFill, anim.image]}>
              {m.image ? <Image source={m.image} style={styles.fill} contentFit="cover" /> : null}
            </Animated.View>
          </View>
          <Animated.View style={[styles.kitchenCaption, anim.caption]}>
            <View style={styles.bar} />
            <Text style={[serif(24, 400, 1.1, -0.014), styles.kitchenName]}>{m.name}</Text>
          </Animated.View>
        </Touchable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  cafeRail: { marginTop: 14, marginHorizontal: 20 },
  cafeCard: { ...StyleSheet.absoluteFill, paddingTop: 7, paddingHorizontal: 7, borderWidth: 1, borderColor: inkA(0.26), borderRadius: 4, backgroundColor: colors.ivory },
  cafePhoto: { height: 172, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.placeholderTile },
  pos: { position: 'absolute', top: 8, right: 8, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 3, backgroundColor: ivoryA(0.92) },
  cafeCaption: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingTop: 9, paddingHorizontal: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  kitchenRail: { marginTop: 14, marginHorizontal: 20 },
  kitchenPhoto: { ...StyleSheet.absoluteFill, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.placeholderTile },
  kitchenCaption: { position: 'absolute', left: 0, bottom: 0, maxWidth: '76%', paddingTop: 12, paddingRight: 18, backgroundColor: colors.oat, borderTopRightRadius: 12 },
  bar: { width: 22, height: 2, backgroundColor: colors.caramel },
  kitchenName: { marginTop: 9, color: colors.ink },
});
