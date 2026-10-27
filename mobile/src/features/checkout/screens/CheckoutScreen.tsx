import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Reveal } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { StickyFooter } from '@/components/layout/StickyFooter';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { isRewardReady, stampsToGo } from '@/domain/loyalty';
import { earnLine, orderTimingLabel } from '@/features/cart/copy';
import { useCartTotals } from '@/features/cart/hooks';
import { useSelectedLocation } from '@/features/locations/hooks';
import { usePlaceOrder } from '@/features/orders/hooks';
import { usePaymentMethods, useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { useNow } from '@/hooks/useNow';
import { errorMessage, isAppError } from '@/services/errors';
import { paymentProvider, type DemoCardInput } from '@/services/integrations/payments';
import { useCartStore } from '@/store/cart';
import { useUiStore } from '@/store/ui';
import { colors, eyebrow, inkA, sans } from '@/theme';
import type { PaymentChoice } from '@/types';
import { formatMoney } from '@/utils/format';
import { PaymentMark, Section, SectionHeader, ToggleCard } from '../components/CheckoutParts';

export function CheckoutScreen() {
  const now = useNow();
  const location = useSelectedLocation();
  const ctx = useCartStore((s) => s.context);
  const lines = useCartStore((s) => s.lines);
  const checkout = useCartStore((s) => s.checkout);
  const { setCheckout, setDeliveryAddress, setTableNumber } = useCartStore.getState();
  const setOrderSettingsOpen = useUiStore((s) => s.setOrderSettingsOpen);
  const totals = useCartTotals();
  const { data: profile } = useProfile();
  const { data: cards = [] } = usePaymentMethods();
  const updateProfile = useUpdateProfile();
  const placeOrder = usePlaceOrder();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contactEdits, setContactEdits] = useState<{ name?: string; phone?: string }>({});
  const [payOpen, setPayOpen] = useState(false);
  const [newCard, setNewCard] = useState<DemoCardInput>({ number: '', expiry: '' });
  const [sumOpen, setSumOpen] = useState(false);
  const [error, setError] = useState('');

  const contact = { name: contactEdits.name ?? profile?.name ?? '', phone: contactEdits.phone ?? profile?.phone ?? '' };

  // Never leave a removed saved card (or Apple Pay on a phone without it) selected.
  const card = cards[0];
  const applePay = useApplePayAvailable();
  const fallback: PaymentChoice = applePay ? 'apple_pay' : 'new_card';
  const payment: PaymentChoice = (checkout.payment === 'saved_card' && !card) || (checkout.payment === 'apple_pay' && !applePay) ? fallback : checkout.payment;
  const options: { value: PaymentChoice; name: string; sub: string }[] = [
    ...(applePay ? [{ value: 'apple_pay' as const, name: 'Apple Pay', sub: 'Fastest · confirm with Face ID' }] : []),
    ...(card ? [{ value: 'saved_card' as const, name: `${card.brand} ·· ${card.last4}`, sub: 'Saved card · 2.95% surcharge' }] : []),
    { value: 'new_card', name: 'New card', sub: 'Visa, Mastercard, Amex, JCB · 2.95% surcharge' },
  ];
  const current = options.find((o) => o.value === payment) ?? options[0]!;
  const apple = payment === 'apple_pay' && totals.total > 0;
  const methodWord = ctx.method === 'Dine In' ? 'Dine in' : ctx.method;

  const adjustments: [string, string][] = [];
  if (totals.delivery) adjustments.push(['Delivery (10%)', '+' + formatMoney(totals.delivery)]);
  if (totals.reward) adjustments.push(['Free coffee', '−' + formatMoney(totals.reward)]);
  if (totals.surcharge) adjustments.push(['Card surcharge (2.95%)', '+' + formatMoney(totals.surcharge)]);
  if (totals.giftCard) adjustments.push(['Gift card', '−' + formatMoney(totals.giftCard)]);

  const toggleDetails = () => {
    if (detailsOpen && profile && (contact.name !== profile.name || contact.phone !== profile.phone) && contact.name.trim()) {
      updateProfile.mutate({ name: contact.name, phone: contact.phone });
    }
    setDetailsOpen((o) => !o);
  };

  const pay = async () => {
    if (placeOrder.isPending || !location) return;
    if (ctx.method === 'Delivery' && !ctx.deliveryAddress.trim()) return setError('Add a delivery address first.');
    if (ctx.method === 'Dine In' && !ctx.tableNumber.trim()) return setError('Add your table number first.');
    setError('');
    try {
      const order = await placeOrder.mutateAsync({
        locationId: location.id,
        method: ctx.method,
        timing: ctx.timing,
        deliveryAddress: ctx.method === 'Delivery' ? ctx.deliveryAddress : undefined,
        tableNumber: ctx.method === 'Dine In' ? ctx.tableNumber : undefined,
        lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, selections: l.selections, note: l.note })),
        payment: { choice: payment, paymentMethodId: payment === 'saved_card' ? card?.id : undefined },
        newCard: payment === 'new_card' ? newCard : undefined,
        useGiftCard: checkout.useGiftCard,
        useReward: checkout.useReward && totals.rewardAvailable,
        contact: { name: contact.name.trim(), phone: contact.phone.trim() },
        expectedTotal: totals.total,
      });
      const ui = useUiStore.getState();
      ui.setNewStamps(order.stampsEarned);
      ui.showPaidOverlay(`${order.paymentLabel} · ${formatMoney(order.totals.total)}`);
      useCartStore.getState().clear();
      router.replace(`/orders/${order.id}`);
    } catch (e) {
      // Closing the card or Apple Pay sheet is not an error.
      setError(isAppError(e) && e.code === 'CANCELLED' ? '' : errorMessage(e));
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Checkout" />
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <Section>
          <SectionHeader label={methodWord} action="Change" onAction={() => setOrderSettingsOpen(true)} />
          <Text style={[sans(15, 600, 1.3), styles.mt4]}>EightyTwenty {location?.name}</Text>
          <Text style={[sans(13, 400, 1.4), styles.sub]}>{orderTimingLabel(ctx, location, now)}</Text>
          {ctx.method === 'Delivery' ? (
            <TextField value={ctx.deliveryAddress} onChangeText={(t) => (setDeliveryAddress(t), setError(''))} placeholder="Delivery address" accessibilityLabel="Delivery address" autoComplete="street-address" height={46} background={colors.cream} style={styles.mt12} />
          ) : null}
          {ctx.method === 'Dine In' ? (
            <TextField value={ctx.tableNumber} onChangeText={(t) => (setTableNumber(t), setError(''))} placeholder="Table number" accessibilityLabel="Table number" keyboardType="number-pad" height={46} background={colors.cream} style={styles.mt12} />
          ) : null}
        </Section>

        <Section>
          <SectionHeader label="Your details" action={detailsOpen ? 'Done' : 'Edit'} onAction={toggleDetails} />
          {detailsOpen ? (
            <Reveal style={styles.details}>
              <TextField value={contact.name} onChangeText={(name) => setContactEdits((c) => ({ ...c, name }))} accessibilityLabel="Name" autoComplete="name" height={46} background={colors.cream} />
              <TextField value={contact.phone} onChangeText={(phone) => setContactEdits((c) => ({ ...c, phone }))} accessibilityLabel="Mobile" keyboardType="phone-pad" autoComplete="tel" height={46} background={colors.cream} />
            </Reveal>
          ) : (
            <>
              <Text style={[sans(15, 600, 1.3), styles.mt4]}>{contact.name}</Text>
              <Text style={[sans(13, 400, 1.4), styles.sub]}>
                {contact.phone} · {profile?.email}
              </Text>
            </>
          )}
        </Section>

        <Section style={styles.paySection}>
          {payOpen ? (
            <Reveal>
              <Text style={[eyebrow(10, 0.12), styles.payWith]}>Pay with</Text>
              {options.map((o) => {
                const on = o.value === payment;
                return (
                  <Touchable
                    key={o.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setCheckout({ payment: o.value });
                      setPayOpen(o.value === 'new_card');
                    }}
                    style={styles.payRow}
                  >
                    <PaymentMark kind={o.value === 'apple_pay' ? 'apple' : 'card'} />
                    <View style={styles.flex}>
                      <Text style={[sans(14, 600, 1.3), { color: colors.ink }]}>{o.name}</Text>
                      <Text style={[sans(12, 400, 1.35), styles.mt2]}>{o.sub}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: on ? colors.ink : inkA(0.28) }]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  </Touchable>
                );
              })}
              {payment === 'new_card' && paymentProvider.cardEntryInApp ? <NewCardFields value={newCard} onChange={(c) => (setNewCard(c), setError(''))} /> : null}
            </Reveal>
          ) : (
            <Touchable onPress={() => setPayOpen(true)} accessibilityLabel={`Payment, ${current.name}. Change`} style={styles.payClosed}>
              <PaymentMark kind={payment === 'apple_pay' ? 'apple' : 'card'} />
              <View style={styles.flex}>
                <Text style={[eyebrow(10, 0.12), { color: colors.textMuted }]}>Payment</Text>
                <Text style={[sans(15, 600, 1.2), styles.mt4]}>{current.name}</Text>
              </View>
              <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Change</Text>
            </Touchable>
          )}
        </Section>

        {totals.giftCardBalance > 0 ? (
          <ToggleCard
            tone="light"
            icon="gift"
            title="Gift card balance"
            sub={checkout.useGiftCard ? `${formatMoney(totals.giftCard)} applied` : `${formatMoney(totals.giftCardBalance)} available`}
            value={checkout.useGiftCard}
            onChange={(v) => setCheckout({ useGiftCard: v })}
          />
        ) : null}
        {totals.rewardAvailable ? (
          <ToggleCard
            tone="dark"
            icon="cupPlain"
            title="Use your free coffee"
            sub={checkout.useReward ? `−${formatMoney(totals.reward)} · your cheapest coffee` : 'Your 10th coffee is on us'}
            value={checkout.useReward}
            onChange={(v) => setCheckout({ useReward: v })}
          />
        ) : null}

        <Section style={styles.summary}>
          <Touchable onPress={() => setSumOpen((o) => !o)} accessibilityState={{ expanded: sumOpen }} pressedScale={1} style={styles.sumHead}>
            <Text style={[sans(14, 600), styles.flex]}>Order summary</Text>
            <Text style={[sans(13), { color: colors.textSecondary }]}>{totals.itemCount === 1 ? '1 item' : `${totals.itemCount} items`}</Text>
            <Chevron open={sumOpen} />
          </Touchable>
          {sumOpen ? (
            <Reveal style={styles.sumLines}>
              {lines.map((l) => (
                <View key={l.key} style={styles.sumLine}>
                  <Text style={[sans(13, 400, 1.4), { color: colors.textSecondary }]}>{l.qty}×</Text>
                  <Text style={[sans(13, 400, 1.4), styles.flex]}>
                    {l.name}
                    {l.modifiersLabel ? <Text style={{ color: colors.textSecondary }}> · {l.modifiersLabel}</Text> : null}
                  </Text>
                  <Text style={sans(13, 400, 1.4)}>{formatMoney(l.unitPrice * l.qty)}</Text>
                </View>
              ))}
            </Reveal>
          ) : null}
          <View style={styles.amounts}>
            <Amount label="Subtotal" value={formatMoney(totals.subtotal)} />
            {adjustments.map(([k, v]) => (
              <Amount key={k} label={k} value={v} />
            ))}
            <View style={styles.totalRow}>
              <Text style={[sans(15, 600), { color: colors.ink }]}>Total</Text>
              <Text style={[sans(20, 600, undefined, -0.01), { color: colors.ink }]}>{formatMoney(totals.total)}</Text>
            </View>
          </View>
        </Section>

        <View style={styles.earn}>
          <Icon name="cupPlain" size={16} strokeWidth={1.7} color={colors.caramelDeep} />
          <Text style={[sans(12, 400, 1.45), styles.flexSub]}>{earnLine(isRewardReady(totals.stamps, totals.stampsPerReward), totals.coffeeCount, stampsToGo(totals.stamps, totals.stampsPerReward))}</Text>
        </View>
        <Text style={[sans(12, 400, 1.45), styles.policy]}>Once submitted, our kitchen gets straight to work, so orders cannot be changed or cancelled.</Text>
        {paymentProvider.isDemo ? <Text style={[sans(12, 400, 1.45), styles.policy]}>Demo mode — no payment is taken.</Text> : null}
      </KeyboardAwareScrollView>
      <StickyFooter>
        {error ? (
          <Text accessibilityRole="alert" style={[sans(13, 500, 1.4), styles.error]}>
            {error}
          </Text>
        ) : null}
        <Button
          label={apple ? `Pay with Apple Pay · ${formatMoney(totals.total)}` : `Place order · ${formatMoney(totals.total)}`}
          onPress={pay}
          loading={placeOrder.isPending}
          variant={apple ? 'applePay' : 'primary'}
          height={56}
          radius={14}
          fontSize={15}
          disabled={!lines.length}
        />
      </StickyFooter>
    </Screen>
  );
}

/**
 * DEMO card entry mirroring the prototype. Number and expiry go only to the payment
 * provider's tokeniser (the demo one keeps brand + last four); the CVC never leaves this
 * component. Production replaces these fields with the provider's PCI-compliant card UI.
 */
function NewCardFields({ value, onChange }: { value: DemoCardInput; onChange: (card: DemoCardInput) => void }) {
  const [cvc, setCvc] = useState('');
  return (
    <View style={styles.newCard}>
      <TextField value={value.number} onChangeText={(number) => onChange({ ...value, number })} placeholder="Card number" accessibilityLabel="Card number" keyboardType="number-pad" autoComplete="cc-number" height={46} background={colors.cream} />
      <View style={styles.row}>
        <TextField value={value.expiry} onChangeText={(expiry) => onChange({ ...value, expiry })} placeholder="MM / YY" accessibilityLabel="Expiry" autoComplete="cc-exp" height={46} background={colors.cream} style={styles.flex} />
        <TextField value={cvc} onChangeText={setCvc} placeholder="CVC" accessibilityLabel="CVC" keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry height={46} background={colors.cream} style={styles.flex} />
      </View>
    </View>
  );
}

/** Apple Pay is offered only where the provider can take it (Square: iPhone with a card in Wallet). */
function useApplePayAvailable() {
  const [available, setAvailable] = useState(paymentProvider.isDemo);
  useEffect(() => {
    let live = true;
    void paymentProvider.isApplePayAvailable().then(
      (ok) => live && setAvailable(ok),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return available;
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.amountRow}>
      <Text style={[sans(13, 400, 1.3), { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[sans(13, 400, 1.3), { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function Chevron({ open }: { open: boolean }) {
  const r = useDerivedValue(() => withTiming(open ? 180 : 0, { duration: 200 }), [open]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={16} strokeWidth={2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, color: colors.ink },
  flexSub: { flex: 1, color: colors.textSecondary },
  content: { gap: 10, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 24 },
  mt2: { marginTop: 2, color: colors.textSecondary },
  mt4: { marginTop: 4, color: colors.ink },
  mt12: { marginTop: 12 },
  sub: { marginTop: 3, color: colors.textSecondary },
  details: { gap: 8, marginTop: 10 },
  paySection: { paddingVertical: 4 },
  payClosed: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 8 },
  payWith: { paddingTop: 12, paddingBottom: 6, color: colors.textMuted },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 6, borderTopWidth: 1, borderTopColor: inkA(0.07) },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  newCard: { gap: 8, paddingTop: 4, paddingBottom: 14 },
  row: { flexDirection: 'row', gap: 8 },
  summary: { paddingTop: 4, paddingBottom: 14 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  sumLines: { gap: 8, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: inkA(0.07) },
  sumLine: { flexDirection: 'row', gap: 8 },
  amounts: { gap: 7 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: inkA(0.07) },
  earn: { flexDirection: 'row', gap: 8, marginTop: 4, marginHorizontal: 2 },
  policy: { marginHorizontal: 2, color: colors.textMuted },
  error: { marginBottom: 10, color: colors.danger },
});
