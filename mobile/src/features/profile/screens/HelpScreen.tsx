import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Reveal } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { CONTACT } from '@/constants/business';
import { useSelectedLocation } from '@/features/locations/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { openEmailDraft, openPhone, openSms } from '@/services/integrations/links';
import { colors, inkA, sans } from '@/theme';
import { useFaqs } from '../hooks';

/** FAQ accordion + call your café / email / same-day bookings. */
export function HelpScreen() {
  const bottom = useBottomSpace(132);
  const location = useSelectedLocation();
  const { data: faqs = [] } = useFaqs();
  const [open, setOpen] = useState(-1);

  return (
    <Screen>
      <ScreenHeader title="Help & contact" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), { color: colors.ink }]}>
          Questions
        </Text>
        <View style={styles.faqs}>
          {faqs.map((f, i) => {
            const on = open === i;
            return (
              <View key={f.question} style={i > 0 && styles.sep}>
                <Touchable onPress={() => setOpen(on ? -1 : i)} accessibilityState={{ expanded: on }} pressedScale={1} style={styles.q}>
                  <Text style={[sans(14, 600, 1.35), styles.qText]}>{f.question}</Text>
                  <View style={{ transform: [{ rotate: on ? '180deg' : '0deg' }] }}>
                    <Icon name="chevronDown" size={16} strokeWidth={2} />
                  </View>
                </Touchable>
                {on ? (
                  <Reveal>
                    <Text style={[sans(13.5, 400, 1.55), styles.a]}>{f.answer}</Text>
                  </Reveal>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text accessibilityRole="header" style={[sans(17, 600, 1.25, -0.01), styles.touch]}>
          Get in touch
        </Text>
        <View style={styles.contacts}>
          {location?.phone ? <Contact icon="phone" title={`Call ${location.name}`} sub={location.phone} onPress={() => openPhone(location.phone!)} /> : null}
          <Contact icon="mail" title="Email us" sub={CONTACT.infoEmail} onPress={() => openEmailDraft(`mailto:${CONTACT.infoEmail}`)} />
          <Contact icon="calendar" title="Same-day bookings" sub={`Text ${CONTACT.sameDaySms}`} onPress={() => openSms(CONTACT.sameDaySms)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Contact({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${title}, ${sub}`} pressedScale={1} style={styles.contact}>
      <View style={styles.contactIcon}>
        <Icon name={icon} size={19} strokeWidth={1.7} />
      </View>
      <View style={styles.flex}>
        <Text style={[sans(14.5, 600, 1.25), { color: colors.ink }]}>{title}</Text>
        <Text style={[sans(12.5, 400, 1.3), styles.sub]}>{sub}</Text>
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { paddingTop: 8, paddingHorizontal: 20 },
  faqs: { marginTop: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  sep: { borderTopWidth: 1, borderTopColor: inkA(0.07) },
  q: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  qText: { flex: 1, color: colors.ink },
  a: { paddingBottom: 14, color: colors.textSecondary },
  touch: { marginTop: 30, color: colors.ink },
  contacts: { marginTop: 6 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingVertical: 6 },
  contactIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.linen, alignItems: 'center', justifyContent: 'center' },
  sub: { marginTop: 2, color: colors.textSecondary },
});
