import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Barcode } from '@/components/ui/Barcode';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { cardBalance, cardSummary } from '@/domain/loyalty';
import { useProfile } from '@/features/profile/hooks';
import { useUiStore } from '@/store/ui';
import { colors, eyebrow, fontFamilies, inkA, sans, serif } from '@/theme';
import { useLoyaltyCard } from '../hooks';

/** "Show at the counter" member barcode. */
export function MemberCardSheet() {
  const open = useUiStore((s) => s.memberCardOpen);
  const setOpen = useUiStore((s) => s.setMemberCardOpen);
  const insets = useSafeAreaInsets();
  const { data: card } = useLoyaltyCard();
  const { data: profile } = useProfile();
  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel="Member card" handle>
      <View style={[styles.body, { paddingBottom: Math.max(34, insets.bottom + 12) }]}>
        <Text style={[eyebrow(10, 0.14), styles.eyebrow]}>Show at the counter</Text>
        <Text accessibilityRole="header" style={[serif(28, 400, 1.1), styles.name]}>
          {profile?.name}
        </Text>
        <Text style={[sans(13, 400, 1.4), styles.sub]}>
          {cardSummary(cardBalance(card))}
        </Text>
        <View style={styles.box} accessible accessibilityLabel={`Member number ${card?.memberNumber ?? ''}`}>
          <Barcode value={card?.memberNumber} height={76} />
          <Text style={[styles.number, { fontFamily: fontFamilies.mono }]}>{card?.memberNumber}</Text>
        </View>
        <Text style={[sans(13, 400, 1.45), styles.note]}>The barista scans this to add a stamp or redeem your free coffee.</Text>
        <Button label="Done" variant="outline" onPress={() => setOpen(false)} height={52} radius={14} fontSize={15} style={styles.done} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, alignItems: 'stretch' },
  eyebrow: { marginTop: 14, color: colors.textMuted, textAlign: 'center' },
  name: { marginTop: 8, color: colors.ink, textAlign: 'center' },
  sub: { marginTop: 4, color: colors.textSecondary, textAlign: 'center' },
  box: { marginTop: 18, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 14, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.1) },
  number: { marginTop: 12, fontSize: 15, fontWeight: '600', letterSpacing: 2.4, color: colors.ink, textAlign: 'center' },
  note: { marginTop: 14, color: colors.textSecondary, textAlign: 'center' },
  done: { marginTop: 16 },
});
