import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { ArrowLong } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, creamA, eyebrow, serif } from '@/theme';

const GIFT_PHOTO = require('../../../../assets/images/promo/gift-cards.webp');

/** Dark "Gift cards — The gift of delicious food." showcase. */
export function GiftCardBanner() {
  return (
    <Touchable onPress={() => router.push('/account/gift-cards')} pressedOpacity={0.9} pressedScale={0.99} accessibilityLabel="Gift cards. The gift of delicious food. Send a gift card" style={styles.card}>
      <View style={styles.top}>
        <Text style={[eyebrow(10, 0.14), { color: colors.sand }]}>Gift cards</Text>
        <Text style={[serif(30, 400, 1.05, -0.018), styles.title]}>The gift of delicious food.</Text>
        <View style={styles.rule} />
      </View>
      <View style={styles.bottom}>
        <View style={styles.send}>
          <Text style={[serif(21, 400), { color: colors.creamText }]}>Send a gift card</Text>
          <ArrowLong color={colors.sand} />
        </View>
        <View style={styles.photo}>
          <Image source={GIFT_PHOTO} style={styles.img} contentFit="cover" />
        </View>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 28, marginHorizontal: 14, borderRadius: 20, backgroundColor: colors.charcoal, overflow: 'hidden' },
  top: { paddingTop: 20, paddingHorizontal: 20 },
  title: { marginTop: 10, maxWidth: '82%', color: colors.creamText },
  rule: { height: 1, marginTop: 16, backgroundColor: creamA(0.22) },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  send: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20, flexShrink: 1 },
  photo: { width: 124, height: 104, marginTop: 14, borderTopLeftRadius: 14, overflow: 'hidden', backgroundColor: colors.charcoalWarm },
  img: { width: '100%', height: '100%' },
});
