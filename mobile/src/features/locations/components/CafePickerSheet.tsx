import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { isComingSoon, locationStatus } from '@/domain/hours';
import { useNow } from '@/hooks/useNow';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { colors, sans } from '@/theme';
import { STATUS_COLORS, useChooseCafe, useLocations } from '../hooks';

/** "Choose a café" — every location with open/closed status; coming-soon cafés are disabled. */
export function CafePickerSheet() {
  const open = useUiStore((s) => !!s.cafePicker);
  const close = useUiStore((s) => s.closeCafePicker);
  const insets = useSafeAreaInsets();
  const selectedId = useCartStore((s) => s.context.locationId);
  const { data: locations = [] } = useLocations();
  const choose = useChooseCafe();
  const now = useNow();

  return (
    <BottomSheet visible={open} onClose={close} accessibilityLabel="Choose a café" maxHeight="84%" handle>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[sans(19, 600, 1.2), { color: colors.ink }]}>
          Choose a café
        </Text>
        <Touchable onPress={close} accessibilityLabel="Close" style={styles.close}>
          <Icon name="close" size={18} strokeWidth={2} />
        </Touchable>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(30, insets.bottom + 12) }}>
        {locations.map((l) => {
          const on = l.id === selectedId;
          const soon = isComingSoon(l);
          const status = locationStatus(l, now);
          return (
            <Touchable
              key={l.id}
              disabled={soon}
              onPress={() => {
                if (choose(l)) close();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: soon }}
              accessibilityLabel={`${l.name}, ${l.area}, ${status.label}`}
              style={[styles.row, { opacity: soon ? 0.5 : 1 }]}
            >
              <View style={[styles.thumbRing, { borderColor: on ? colors.ink : 'transparent' }]}>
                <View style={styles.thumb}>{l.image ? <Image source={l.image} style={styles.fill} contentFit="cover" /> : null}</View>
              </View>
              <View style={styles.text}>
                <Text style={[sans(15, 600, 1.2), { color: colors.ink }]}>{l.name}</Text>
                <Text numberOfLines={1} style={[sans(12.5, 400, 1.3), { color: colors.textSecondary }]}>
                  {l.area}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={[sans(12, 500, 1.2), { color: STATUS_COLORS[status.tone] }]}>{status.label}</Text>
                {on ? <Icon name="check" size={18} strokeWidth={2.4} /> : null}
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingLeft: 20, paddingRight: 12, paddingBottom: 4 },
  close: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  list: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  thumbRing: { padding: 2, borderWidth: 2, borderRadius: 14 },
  thumb: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.linen },
  fill: { width: '100%', height: '100%' },
  text: { flex: 1, minWidth: 0, gap: 3 },
  right: { alignItems: 'flex-end', gap: 6 },
});
