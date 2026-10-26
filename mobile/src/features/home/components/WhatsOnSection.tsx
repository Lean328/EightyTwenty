import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { ArrowLong } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { colors, eyebrow, inkA, sans, serif } from '@/theme';
import type { WhatsOnItem } from '../whatsOn';
import { SectionHeading } from './SectionHeading';

/** "01 What's on": a lead offer with a ringed photo, then a 3-up editorial grid. */
export function WhatsOnSection({ items, leadSub }: { items: WhatsOnItem[]; leadSub: string }) {
  const [lead, ...rest] = items;
  return (
    <View style={styles.section}>
      <SectionHeading number="01" title="What's on" actionLabel="See all" onAction={() => router.push('/offers')} />
      {lead ? (
        <Touchable onPress={() => router.push(lead.href)} pressedScale={1} pressedOpacity={0.85} accessibilityLabel={`${lead.title}. ${leadSub}. See offer`} style={styles.lead}>
          <Text style={[serif(42, 400, 0.98, -0.026), { color: colors.ink }]}>{lead.title}</Text>
          <Text style={[sans(13.5, 400, 1.4), styles.leadSub]}>{leadSub}</Text>
          <View style={styles.leadCta}>
            <Text style={[sans(13, 600), { color: colors.ink }]}>See offer</Text>
            <ArrowLong color={colors.ink} />
          </View>
          {/* 116pt photo with a 1px ring and a second ring 6pt out (CSS box-shadow + outline-offset) */}
          <View style={styles.outerRing}>
            <View style={styles.innerRing}>
              {lead.image ? <Image source={lead.image} style={styles.leadImg} contentFit="cover" contentPosition={{ top: '58%', left: '50%' }} /> : null}
            </View>
          </View>
        </Touchable>
      ) : null}
      {rest.length ? (
        <View style={styles.grid}>
          {rest.map((w) => (
            <Touchable key={w.key} onPress={() => router.push(w.href)} accessibilityLabel={`${w.tag}: ${w.brief}`} style={styles.cell}>
              <Text style={[eyebrow(9.5, 0.14), { color: colors.caramelDeep }]}>{w.tag}</Text>
              <Text style={[serif(15.5, 400, 1.15, -0.01), { color: colors.ink }]}>{w.brief}</Text>
            </Touchable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, marginHorizontal: 20 },
  lead: { minHeight: 118, marginTop: 18, paddingRight: 138 },
  leadSub: { marginTop: 10, color: colors.textSecondary },
  leadCta: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  outerRing: { position: 'absolute', top: -7, right: -1, width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: inkA(0.22), alignItems: 'center', justifyContent: 'center' },
  innerRing: { width: 118, height: 118, borderRadius: 59, borderWidth: 1, borderColor: inkA(0.22), overflow: 'hidden', backgroundColor: colors.linen },
  leadImg: { width: '100%', height: '100%' },
  grid: { flexDirection: 'row', gap: 16, marginTop: 22 },
  cell: { flex: 1, minWidth: 88, gap: 7, paddingTop: 10, paddingBottom: 2, borderTopWidth: 1, borderTopColor: inkA(0.22) },
});
