import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CalendarSheet } from '@/components/shared/CalendarSheet';
import { DateButton, StepLabel, SuccessCard, Summary } from '@/components/shared/FormBits';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { AlertBox } from '@/components/ui/Feedback';
import { TextAction } from '@/components/ui/Links';
import { Text } from '@/components/ui/Text';
import { Field, TextField } from '@/components/ui/TextField';
import { TimeField } from '@/components/ui/TimeField';
import { Touchable } from '@/components/ui/Touchable';
import { BOOKING_RULES, CONTACT } from '@/constants/business';
import { bookingEmailDraft, checkBookingTime, validateReservation, type ReservationErrors } from '@/domain/reservations';
import { useLocations, useSelectedLocation } from '@/features/locations/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useNow } from '@/hooks/useNow';
import { useGoToTab } from '@/navigation/tabNavigation';
import { errorMessage } from '@/services/errors';
import { openEmailDraft, openSms } from '@/services/integrations/links';
import { colors, eyebrow, espressoA, sans, serif, serifItalic } from '@/theme';
import type { ReservationRequest, TablePreference } from '@/types';
import { formatDateLong, formatDateShort, parseISODate } from '@/utils/datetime';
import { formatTimeOfDay } from '@/utils/format';
import { useCreateReservation } from '../hooks';

const BRUNCH = require('../../../../assets/images/lifestyle/brunch-table.webp');

type Form = Omit<ReservationRequest, 'guests' | 'name' | 'phone' | 'email'> & { guests: string };
type ContactEdits = Partial<Pick<ReservationRequest, 'name' | 'phone' | 'email'>>;

/**
 * Reserve a table — mirrors the website's request form. Bookings are requests confirmed
 * by email (no live availability); the time is checked against the café's published hours
 * and the 12-hour notice rule.
 */
export function ReserveScreen() {
  const params = useLocalSearchParams<{ locationId?: string }>();
  const scroll = useRef<ScrollViewInstance>(null);
  const now = useNow(30_000);
  const goToTab = useGoToTab();
  const selected = useSelectedLocation();
  const { data: locations = [] } = useLocations();
  const { data: profile } = useProfile();
  const create = useCreateReservation();
  const [details, setDetails] = useState<Form>({ locationId: params.locationId ?? selected?.id ?? 'phillip', guests: String(BOOKING_RULES.defaultGuests), date: '', time: '', seating: 'Indoor', notes: '' });
  // Contact fields default to the profile until the customer edits them.
  const [contactEdits, setContactEdits] = useState<ContactEdits>({});
  const form = { ...details, name: contactEdits.name ?? profile?.name ?? '', phone: contactEdits.phone ?? profile?.phone ?? '', email: contactEdits.email ?? profile?.email ?? '' };
  const [errors, setErrors] = useState<ReservationErrors>({});
  const [calendar, setCalendar] = useState(false);
  const [done, setDone] = useState<{ draft: string } | null>(null);
  const [submitError, setSubmitError] = useState('');

  const location = locations.find((l) => l.id === form.locationId) ?? locations[0];
  const check = useMemo(() => (location ? checkBookingTime(location, form.date || null, form.time || null, now) : { ok: false, message: '', hint: '' }), [location, form.date, form.time, now]);
  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => {
    setDetails((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setContact = (key: keyof ContactEdits) => (value: string) => {
    setContactEdits((c) => ({ ...c, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const timeInvalid = !!check.message || !!errors.time;

  const submit = async () => {
    if (!location) return;
    const errs = validateReservation(form, check.ok);
    if (Object.keys(errs).length) return setErrors(errs);
    const req: ReservationRequest = { ...form, guests: parseInt(form.guests, 10), name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim() };
    try {
      setSubmitError('');
      await create.mutateAsync(req);
      const draft = bookingEmailDraft(location, req);
      setDone({ draft });
      scroll.current?.scrollTo({ y: 0, animated: false });
      void openEmailDraft(draft);
    } catch (e) {
      setSubmitError(errorMessage(e));
    }
  };

  const reset = () => {
    setDone(null);
    setErrors({});
    setDetails((f) => ({ ...f, guests: String(BOOKING_RULES.defaultGuests), date: '', time: '', notes: '' }));
  };

  const dateLabel = form.date ? formatDateShort(parseISODate(form.date)) : 'Select a date';
  const when = form.date ? `${formatDateLong(parseISODate(form.date))}${form.time ? ', ' + formatTimeOfDay(form.time) : ''}` : '';

  return (
    <Screen background={colors.sandstone}>
      <ScreenHeader title="Reserve" background={colors.sandstone} color={colors.espressoText} titleStyle={sans(14, 500, 1.2)} />
      <KeyboardAwareScrollView ref={scroll} contentContainerStyle={styles.content}>
        {done ? (
          <Rise duration={400}>
            <SuccessCard title="Your booking email is ready.">
              <Text style={[sans(15, 400, 1.5), { color: colors.espresso }]}>Send the draft from your email app to request your table. The café will confirm by email.</Text>
              <TextAction label="Open the email draft again" onPress={() => openEmailDraft(done.draft)} underline weight={500} style={styles.link} />
              <Summary
                rows={[
                  ['Café', location?.bookingLabel ?? location?.name ?? ''],
                  ['Guests', form.guests],
                  ['When', when],
                  ['Table', form.seating],
                  ['Contact', form.email],
                ]}
              />
              <View style={styles.row2}>
                <Button label="New request" variant="espressoOutline" onPress={reset} height={46} radius={999} weight={500} style={styles.flex} />
                <Button
                  label="See the menu"
                  variant="espresso"
                  onPress={() => {
                    reset();
                    goToTab('menu');
                  }}
                  height={46}
                  radius={999}
                  weight={500}
                  style={styles.flex}
                />
              </View>
            </SuccessCard>
          </Rise>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={[eyebrow(11, 0.18, 500), styles.kicker]}>Bookings</Text>
              <Text accessibilityRole="header" style={[serif(34, 300, 1.05, -0.01), { color: colors.espressoText }]}>
                A table at your local, <Text style={serifItalic(34, 300, 1.05, -0.01)}>kept for you.</Text>
              </Text>
              <Text style={[sans(14, 400, 1.55), styles.lede]}>Brunch for two or a long table for the whole family. Send us a request and we’ll confirm by email.</Text>
            </View>
            <View style={styles.hero}>
              <Image source={BRUNCH} style={styles.fill} contentFit="cover" accessibilityLabel="Brunch table at EightyTwenty" />
              <View style={styles.heroChips}>
                {['Open daily', 'Indoor & outdoor', '12h notice preferred'].map((t) => (
                  <View key={t} style={styles.heroChip}>
                    <Text style={[sans(11.5, 500), { color: colors.espressoText }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={[serif(26, 300, 1), { color: colors.espressoText }]}>Request a table</Text>
                <Text style={[sans(12), { color: colors.textWarmMuted }]}>Reply by email</Text>
              </View>

              <View>
                <StepLabel>1 · Location</StepLabel>
                <View style={styles.chips}>
                  {locations.map((l) => (
                    <Chip key={l.id} tone="espresso" label={l.name} selected={l.id === form.locationId} onPress={() => set('locationId')(l.id)} />
                  ))}
                </View>
              </View>

              <View>
                <StepLabel>2 · Booking details</StepLabel>
                <View style={styles.details}>
                  <Field label="Guests" gap={8} style={styles.guests}>
                    <TextField tone="espresso" value={form.guests} onChangeText={set('guests')} keyboardType="number-pad" accessibilityLabel="Guests" height={46} background={colors.sandstoneCard} error={errors.guests} style={styles.inputPad} />
                  </Field>
                  <Field label="Date" gap={8} style={styles.flex}>
                    <DateButton label={dateLabel} hasValue={!!form.date} error={errors.date} onPress={() => setCalendar(true)} accessibilityLabel="Date" />
                  </Field>
                  <Field label="Time" gap={8} style={styles.flex}>
                    <TimeField value={form.time} onChange={set('time')} accessibilityLabel="Preferred time" invalid={timeInvalid} />
                  </Field>
                </View>
                <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={[sans(11.5, 400, 1.4), { marginTop: 8, color: check.message ? colors.dangerBright : colors.textWarmMuted }]}>
                  {check.hint}
                </Text>
                <View style={styles.seatRow}>
                  <Text style={[sans(12, 500), { color: colors.espressoText }]}>Table preference</Text>
                  <View style={styles.seatPill}>
                    {(['Indoor', 'Outdoor'] as TablePreference[]).map((s) => {
                      const on = form.seating === s;
                      return (
                        <Touchable key={s} onPress={() => set('seating')(s)} pressedScale={1} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.seat, on && { backgroundColor: colors.espresso }]}>
                          <Text style={[sans(13, 500), { color: on ? colors.sandstone : colors.espresso }]}>{s}</Text>
                        </Touchable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View>
                <StepLabel>3 · Contact details</StepLabel>
                <View style={styles.contact}>
                  <Field label="Name">
                    <TextField tone="espresso" value={form.name} onChangeText={setContact('name')} placeholder="Full name" autoComplete="name" accessibilityLabel="Name" height={46} background={colors.sandstoneCard} error={errors.name} style={styles.inputPad} />
                  </Field>
                  <Field label="Phone">
                    <TextField tone="espresso" value={form.phone} onChangeText={setContact('phone')} placeholder="0400 000 000" keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Phone" height={46} background={colors.sandstoneCard} error={errors.phone} style={styles.inputPad} />
                  </Field>
                  <Field label="Email">
                    <TextField tone="espresso" value={form.email} onChangeText={setContact('email')} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" height={46} background={colors.sandstoneCard} error={errors.email} style={styles.inputPad} />
                  </Field>
                </View>
              </View>

              <View>
                <StepLabel optional>4 · Special requests</StepLabel>
                <TextField tone="espresso" value={form.notes} onChangeText={set('notes')} placeholder="Dietary requirements, high chair, a birthday…" multiline height={84} accessibilityLabel="Special requests" background={colors.sandstoneCard} style={styles.inputPad} />
              </View>

              {hasErrors ? <AlertBox>Please fill in the highlighted fields so we can confirm your booking.</AlertBox> : null}
              {submitError ? <AlertBox>{submitError}</AlertBox> : null}
              <View style={styles.ctaWrap}>
                <Button label="Prepare booking email" variant="espresso" onPress={submit} loading={create.isPending} disabled={!check.ok} height={52} radius={999} weight={500} fontSize={15} style={{ opacity: check.ok ? 1 : 0.45 }} />
                <Text style={[sans(12, 400, 1.4), styles.caption]}>Send the email draft to request a table.</Text>
              </View>
            </View>

            <View style={styles.dl}>
              <Info term="Confirmation">We reply by email once your table is set.</Info>
              <Info term="Same-day">
                Text{' '}
                <Text onPress={() => openSms(CONTACT.sameDaySms)} accessibilityRole="link" style={styles.sms}>
                  {CONTACT.sameDaySms}
                </Text>{' '}
                for today.
              </Info>
              <Info term="Hours">Most cafés 6–7am to 3pm, seven days.</Info>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>
      <CalendarSheet
        visible={calendar}
        selected={form.date || null}
        onClose={() => setCalendar(false)}
        onSelect={(d) => {
          set('date')(d);
          setCalendar(false);
        }}
        note={`Bookings need at least 12 hours’ notice. For today, text ${CONTACT.sameDaySms}.`}
      />
    </Screen>
  );
}

function Info({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={[eyebrow(11, 0.14, 500), { color: colors.caramelDeep }]}>{term}</Text>
      <Text style={[sans(14, 400, 1.5), { marginTop: 8, color: colors.espresso }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  content: { paddingBottom: 36 },
  link: { alignSelf: 'flex-start' },
  row2: { flexDirection: 'row', gap: 10 },
  intro: { paddingTop: 10, paddingHorizontal: 20 },
  kicker: { marginBottom: 10, color: colors.caramelDeep },
  lede: { marginTop: 12, color: colors.espresso },
  hero: { height: 168, marginTop: 18, marginHorizontal: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.linenDeep },
  heroChips: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip: { height: 28, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(243,238,229,0.94)' },
  card: { gap: 22, marginTop: 18, marginHorizontal: 16, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 22, borderWidth: 1, borderColor: espressoA(0.14), borderRadius: 10, backgroundColor: colors.sandstoneCard },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: espressoA(0.1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  details: { flexDirection: 'row', gap: 10 },
  guests: { width: 76 },
  inputPad: { paddingHorizontal: 12 },
  seatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  seatPill: { flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: 1, borderColor: espressoA(0.2) },
  seat: { height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  contact: { gap: 12 },
  ctaWrap: { gap: 10, paddingTop: 4 },
  caption: { textAlign: 'center', color: colors.textWarmMuted },
  dl: { gap: 16, paddingTop: 24, paddingHorizontal: 20 },
  sms: { color: colors.espressoText, textDecorationLine: 'underline' },
});
