import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Rise } from '@/components/layout/Rise';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, inkA, sans, shadows } from '@/theme';

const BRUNCH = require('../../../../assets/images/lifestyle/brunch-table.webp');
const BAGEL = require('../../../../assets/images/catering/breakfast-bagel.webp');

/** "Reserve a table · 12 hours' notice" and "Catering · From $16.50 pp" cards. */
export function QuickActions({ cateringFrom }: { cateringFrom: string }) {
  return (
    <Rise delay={60} duration={340} style={styles.row}>
      <Action image={BRUNCH} title="Reserve a table" sub={'12 hours’ notice'} onPress={() => router.push('/reserve')} />
      <Action image={BAGEL} title="Catering" sub={cateringFrom} onPress={() => router.push('/catering')} />
    </Rise>
  );
}

function Action({ image, title, sub, onPress }: { image: number; title: string; sub: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityLabel={`${title}, ${sub}`} style={styles.card}>
      <View style={styles.thumb}>
        <Image source={image} style={styles.img} contentFit="cover" />
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={[sans(13, 600, 1.15, -0.01), { color: colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[sans(11.5, 400, 1.2), { color: colors.textSecondary }]}>
          {sub}
        </Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginHorizontal: 20 },
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 64, paddingHorizontal: 10, borderWidth: 1, borderColor: inkA(0.1), borderRadius: 16, backgroundColor: colors.ivory, ...shadows.quickAction },
  thumb: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.linen },
  img: { width: '100%', height: '100%' },
  text: { flex: 1, minWidth: 0, gap: 3 },
});
