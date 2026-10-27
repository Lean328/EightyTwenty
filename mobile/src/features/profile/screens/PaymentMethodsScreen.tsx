import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Reveal } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { config } from '@/constants/config';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useCartStore } from '@/store/cart';
import { showToast } from '@/store/ui';
import { colors, fontFamilies, inkA, sans } from '@/theme';
import { useAddCard, usePaymentMethods, useRemoveCard } from '../hooks';

/**
 * Saved payment methods. Only tokenised display data (brand, last four, expiry) is kept.
 * DEMO: card entry is local; production must use the payment provider's secure card form.
 */
export function PaymentMethodsScreen() {
  const bottom = useBottomSpace(132);
  const { data: cards = [] } = usePaymentMethods();
  const addCard = useAddCard();
  const removeCard = useRemoveCard();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState(false);

  const save = () =>
    addCard.mutate(
      { number, expiry },
      {
        onSuccess: () => {
          setOpen(false);
          setNumber('');
          setExpiry('');
          showToast('Card saved');
        },
        onError: () => setError(true),
      },
    );

  return (
    <Screen>
      <ScreenHeader title="Payment methods" />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: bottom }]}>
        <View style={styles.row}>
          <View style={[styles.mark, { backgroundColor: colors.black }]}>
            <Text style={{ fontFamily: fontFamilies.system, fontSize: 12, fontWeight: '600', color: colors.white }}>Pay</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[sans(14.5, 600, 1.25), { color: colors.ink }]}>Apple Pay</Text>
            <Text style={[sans(12.5, 400, 1.3), styles.sub]}>Default · fastest checkout</Text>
          </View>
        </View>
        {cards.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={[styles.mark, { backgroundColor: colors.linen }]}>
              <Text style={[sans(10, 700, undefined, 0.04), { color: colors.ink }]}>{c.brand}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[sans(14.5, 600, 1.25), { color: colors.ink }]}>
                {c.brand} ·· {c.last4}
              </Text>
              <Text style={[sans(12.5, 400, 1.3), styles.sub]}>Expires {c.expiry}</Text>
            </View>
            <TextAction
              label="Remove"
              color={colors.danger}
              onPress={() =>
                removeCard.mutate(c.id, {
                  onSuccess: () => {
                    const { checkout, setCheckout } = useCartStore.getState();
                    if (checkout.payment === 'saved_card') setCheckout({ payment: 'apple_pay' });
                    showToast('Card removed');
                  },
                })
              }
            />
          </View>
        ))}
        {!cards.length && config.features.savedCards ? <Text style={[sans(13, 400, 1.45), styles.none]}>No saved cards — add one for a faster checkout.</Text> : null}
        {/* Saving a card needs Square's Cards API: until then cards are entered at checkout. */}
        {!config.features.savedCards ? null : open ? (
          <Reveal style={styles.form}>
            <TextField value={number} onChangeText={(t) => (setNumber(t), setError(false))} placeholder="Card number" accessibilityLabel="Card number" keyboardType="number-pad" autoComplete="cc-number" background={colors.cream} />
            <TextField value={expiry} onChangeText={(t) => (setExpiry(t), setError(false))} placeholder="MM / YY" accessibilityLabel="Expiry" autoComplete="cc-exp" background={colors.cream} />
            {error ? (
              <Text accessibilityRole="alert" style={[sans(13, 500, 1.4), { color: colors.danger }]}>
                Check the card number and expiry.
              </Text>
            ) : null}
            <Button label="Save card" onPress={save} loading={addCard.isPending} style={styles.mt4} />
            {config.dataSource === 'mock' ? <Text style={[sans(11, 400, 1.4), styles.demo]}>Demo mode — the card number isn’t sent or stored; only the brand and last four digits are kept.</Text> : null}
          </Reveal>
        ) : (
          <Touchable onPress={() => setOpen(true)} style={styles.add}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            <Text style={[sans(14, 600), { color: colors.ink }]}>Add a card</Text>
          </Touchable>
        )}
        <Text style={[sans(12, 400, 1.45), styles.note]}>Visa, Mastercard, Amex and JCB accepted. Card payments carry a 2.95% surcharge.</Text>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { gap: 10, paddingTop: 8, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  mark: { width: 46, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  sub: { marginTop: 2, color: colors.textSecondary },
  none: { marginVertical: 4, marginHorizontal: 2, color: colors.textSecondary },
  form: { gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  mt4: { marginTop: 4 },
  demo: { color: colors.textMuted, textAlign: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: inkA(0.28) },
  note: { marginTop: 6, marginHorizontal: 2, color: colors.textMuted },
});
