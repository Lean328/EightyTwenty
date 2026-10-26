import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from '@/components/layout/KeyboardAwareScrollView';
import { fadeKeyframe, Reveal, Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CalendarSheet } from '@/components/shared/CalendarSheet';
import { DateButton, SuccessCard, Summary } from '@/components/shared/FormBits';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { AlertBox } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { TextAction } from '@/components/ui/Links';
import { SelectField } from '@/components/ui/SelectField';
import { Text } from '@/components/ui/Text';
import { Field, TextField } from '@/components/ui/TextField';
import { TimeField } from '@/components/ui/TimeField';
import { Touchable } from '@/components/ui/Touchable';
import { cateringEmailDraft, cateringEstimate, validateCateringEnquiry, type CateringErrors } from '@/domain/catering';
import { DIETARY_OPTIONS } from '@/domain/dietary';
import { usePreferences, useProfile } from '@/features/profile/hooks';
import { errorMessage } from '@/services/errors';
import { openEmailDraft } from '@/services/integrations/links';
import { colors, eyebrow, espressoA, sans, serif } from '@/theme';
import type { CateringEnquiryRequest } from '@/types';
import { formatDateLong, formatDateShort, parseISODate } from '@/utils/datetime';
import { firstNameOf, formatTimeOfDay, lastNameOf } from '@/utils/format';
import { useCateringPackages, useCreateCateringEnquiry } from '../hooks';

const HIGHLIGHTS = [
  { icon: require('../../../../assets/icons/catering-tailored.webp'), title: 'Tailored to you', sub: 'Made to suit your event' },
  { icon: require('../../../../assets/icons/catering-dietary.webp'), title: 'Dietary flexibility', sub: 'Vegan & gluten free available' },
  { icon: require('../../../../assets/icons/catering-bestfor.webp'), title: 'Best for', sub: 'Functions, meetings, celebrations' },
  { icon: require('../../../../assets/icons/catering-enquiry.webp'), title: 'Easy enquiry', sub: 'Send details, we confirm by email' },
];
const SPREAD = require('../../../../assets/images/lifestyle/table-spread.webp');

type Form = Omit<CateringEnquiryRequest, 'packageId' | 'guests' | 'date' | 'time'> & { guests: string; date: string; time: string };

/** Catering: packages (from $X pp), highlights and the website's enquiry form (email draft to info@). */
export function CateringScreen() {
  const scroll = useRef<ScrollView>(null);
  const formY = useRef(0);
  const { data: packages = [] } = useCateringPackages();
  const { data: profile } = useProfile();
  const { data: prefs } = usePreferences();
  const create = useCreateCateringEnquiry();
  const [tab, setTab] = useState(0);
  const [included, setIncluded] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [errors, setErrors] = useState<CateringErrors>({});
  const [sent, setSent] = useState<{ draft: string } | null>(null);
  const [submitError, setSubmitError] = useState('');
  // Customer edits layered over defaults from the profile and dietary preferences.
  const [edits, setEdits] = useState<Partial<Form>>({});
  const defaults: Form = {
    firstName: firstNameOf(profile?.name ?? ''),
    lastName: lastNameOf(profile?.name ?? ''),
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    company: '',
    occasion: '',
    guests: '',
    date: '',
    time: '',
    location: '',
    dietary: prefs?.dietary ?? [],
    notes: '',
  };
  const form: Form = { ...defaults, ...edits };

  const pkg = packages[tab];
  const guests = parseInt(form.guests, 10) || null;
  const estimate = cateringEstimate(pkg, guests);
  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => {
    setEdits((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const contactOpen = editContact || !!(errors.firstName || errors.lastName || errors.email || errors.phone);
  const request = (): CateringEnquiryRequest => ({ ...form, packageId: pkg?.id ?? '', guests, date: form.date || null, time: form.time || null });

  const submit = async () => {
    if (!pkg) return;
    const req = request();
    const errs = validateCateringEnquiry(req);
    if (Object.keys(errs).length) return setErrors(errs);
    try {
      setSubmitError('');
      await create.mutateAsync(req);
      const draft = cateringEmailDraft(pkg, req);
      setSent({ draft });
      scroll.current?.scrollTo({ y: 0, animated: false });
      void openEmailDraft(draft);
    } catch (e) {
      setSubmitError(errorMessage(e));
    }
  };

  const resetForm = () => setEdits((f) => ({ ...f, occasion: '', date: '', time: '', guests: '', location: '', notes: '' }));
  const when = (form.date ? formatDateLong(parseISODate(form.date)) : 'Date to be confirmed') + (form.time ? ', ' + formatTimeOfDay(form.time) : '');

  return (
    <Screen background={colors.sandstone}>
      <ScreenHeader title="Catering" background={colors.sandstone} color={colors.espressoText} titleStyle={sans(14, 500, 1.2)} />
      <KeyboardAwareScrollView ref={scroll} contentContainerStyle={styles.content}>
        {sent && pkg ? (
          <Rise duration={400}>
            <SuccessCard title="Your email draft is ready.">
              <Text style={[sans(15, 400, 1.5), { color: colors.espresso }]}>Send it from your email app to complete the enquiry. We’ll respond as soon as we can with a quote for your event.</Text>
              <TextAction label="Open it again" onPress={() => openEmailDraft(sent.draft)} underline weight={500} style={styles.selfStart} />
              <Summary rows={[['Package', pkg.name], ['People', guests ? String(guests) : 'To be confirmed'], ['When', when], ['Contact', form.email]]} />
              <View style={styles.row2}>
                <Button
                  label="View requests"
                  variant="espressoOutline"
                  onPress={() => {
                    setSent(null);
                    resetForm();
                    router.push({ pathname: '/account/activity', params: { segment: 'catering' } });
                  }}
                  height={46}
                  radius={999}
                  weight={500}
                  style={styles.flex}
                />
                <Button label="Done" variant="espresso" onPress={() => (router.canGoBack() ? router.back() : setSent(null))} height={46} radius={999} weight={500} style={styles.flex} />
              </View>
            </SuccessCard>
          </Rise>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={[eyebrow(11, 0.2, 500), { color: colors.caramelDeep }]}>Catering</Text>
              <Text accessibilityRole="header" style={[serif(40, 300, 0.98, -0.02), styles.h2]}>
                Good food, made for sharing.
              </Text>
              <Text style={[sans(14.5, 400, 1.55), styles.lede]}>Breakfast, lunch and afternoon tea catering for meetings, events and everyday gatherings.</Text>
              <View style={styles.tabs} accessibilityRole="tablist">
                {packages.map((p, i) => {
                  const on = i === tab;
                  return (
                    <Touchable
                      key={p.id}
                      onPress={() => {
                        setTab(i);
                        setIncluded(false);
                      }}
                      pressedOpacity={0.7}
                      pressedScale={1}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[styles.tab, { borderBottomColor: on ? colors.caramelDeep : 'transparent' }]}
                    >
                      <Text style={[sans(14, on ? 500 : 400, 1.3), { color: on ? colors.caramelDeep : colors.textWarmMuted }]}>{p.name}</Text>
                    </Touchable>
                  );
                })}
              </View>
            </View>

            {pkg ? (
              <View style={styles.pkg}>
                <View style={styles.pkgPhoto}>
                  <Animated.View key={pkg.id} entering={fadeKeyframe(500)} style={StyleSheet.absoluteFill}>
                    {pkg.image ? <Image source={pkg.image} style={styles.fill} contentFit="cover" accessibilityLabel={`${pkg.name} catering`} /> : null}
                  </Animated.View>
                </View>
                <View style={styles.priceRow}>
                  <View style={styles.price}>
                    <Text style={[sans(13), { color: colors.textWarmMuted }]}>From</Text>
                    <Text style={[sans(28), { color: colors.espressoText }]}>{pkg.priceLabel}</Text>
                    <Text style={[sans(13), { color: colors.textWarmMuted }]}>{pkg.unit}</Text>
                  </View>
                  <Touchable onPress={() => setIncluded((v) => !v)} pressedOpacity={0.75} pressedScale={1} accessibilityState={{ expanded: included }} style={styles.incl}>
                    <Text style={[sans(13, 500), { color: colors.espresso }]}>{included ? 'Hide details' : 'What’s included'}</Text>
                    <Chevron open={included} />
                  </Touchable>
                </View>
                {included ? (
                  <Reveal duration={250} style={styles.inclBody}>
                    <Text style={[sans(14.5, 400, 1.55), { color: colors.espresso }]}>{pkg.blurb}</Text>
                    <View style={styles.inclList}>
                      {pkg.inclusions.map((x) => (
                        <Text key={x} style={[sans(14, 400, 1.5), styles.inclItem]}>
                          {x}
                        </Text>
                      ))}
                    </View>
                  </Reveal>
                ) : null}
                <Button label="Enquire" variant="espresso" onPress={() => scroll.current?.scrollTo({ y: formY.current - 8, animated: true })} height={46} radius={999} weight={500} style={styles.enquire} />
              </View>
            ) : null}

            <View style={styles.highlights}>
              {HIGHLIGHTS.map((h) => (
                <View key={h.title} style={styles.highlight}>
                  <Image source={h.icon} style={styles.hIcon} contentFit="contain" />
                  <View>
                    <Text style={[serif(17, 400, 1.2), styles.center, { color: colors.espressoText }]}>{h.title}</Text>
                    <Text style={[sans(12.5, 400, 1.4), styles.center, styles.hSub]}>{h.sub}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.formIntro} onLayout={(e) => (formY.current = e.nativeEvent.layout.y)}>
              <Text style={[eyebrow(11, 0.18, 500), styles.kicker]}>Catering enquiry</Text>
              <Text style={[serif(26, 300, 1.1), { color: colors.espressoText }]}>To enquire about catering with us, fill in the form and we will respond as soon as we can.</Text>
              <Image source={SPREAD} style={styles.spread} contentFit="cover" accessibilityLabel="Catering table spread" />
            </View>

            <View style={styles.card}>
              {contactOpen ? (
                <Reveal style={styles.contactGrid}>
                  <Field label="First name" style={styles.half}>
                    <EField value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" accessibilityLabel="First name" error={errors.firstName} />
                  </Field>
                  <Field label="Last name" style={styles.half}>
                    <EField value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" accessibilityLabel="Last name" error={errors.lastName} />
                  </Field>
                  <Field label="Email" style={styles.full}>
                    <EField value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Email" error={errors.email} />
                  </Field>
                  <Field label="Phone" style={styles.full}>
                    <EField value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" accessibilityLabel="Phone" error={errors.phone} />
                  </Field>
                  <Field label="Company name" optional style={styles.full}>
                    <EField value={form.company} onChangeText={set('company')} autoComplete="organization" accessibilityLabel="Company name" />
                  </Field>
                </Reveal>
              ) : (
                <View style={styles.contactSummary}>
                  <View style={styles.flex}>
                    <Text style={[sans(14, 500, 1.3), { color: colors.espressoText }]}>{`${form.firstName} ${form.lastName}`.trim() || 'Your details'}</Text>
                    <Text numberOfLines={1} style={[sans(12.5, 400, 1.35), styles.contactLine]}>
                      {[form.phone, form.email].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <TextAction label="Edit" onPress={() => setEditContact(true)} weight={500} underline />
                </View>
              )}
              <Field label="Occasion?">
                <EField value={form.occasion} onChangeText={set('occasion')} placeholder="Meeting, function, celebration…" accessibilityLabel="Occasion" />
              </Field>
              <View style={styles.row2}>
                <Field label="Date" style={styles.flex}>
                  <DateButton label={form.date ? formatDateShort(parseISODate(form.date)) : 'Select a date'} hasValue={!!form.date} onPress={() => setCalendar(true)} accessibilityLabel="Date" />
                </Field>
                <Field label="Time" optional style={styles.flex}>
                  <TimeField value={form.time} onChange={set('time')} accessibilityLabel="Time (optional)" />
                </Field>
              </View>
              <View style={styles.row2}>
                <Field label="How many people?" style={styles.flex}>
                  <EField value={form.guests} onChangeText={set('guests')} keyboardType="number-pad" accessibilityLabel="How many people" />
                </Field>
                <Field label="Catering menu" style={styles.flex}>
                  <SelectField tone="espresso" value={pkg?.id ?? ''} options={packages.map((p) => ({ value: p.id, label: p.name }))} onChange={(id) => setTab(Math.max(0, packages.findIndex((p) => p.id === id)))} accessibilityLabel="Catering menu" title="Catering menu" background={colors.sandstoneCard} />
                </Field>
              </View>
              {estimate ? (
                <Text style={[sans(12, 400, 1.45), styles.estimate]}>
                  <Text style={[sans(12, 500, 1.45), { color: colors.espressoText }]}>{estimate}</Text> · an estimate from the listed per-person price, not a quote. Catering is quoted per event.
                </Text>
              ) : null}
              <Field label="Location?">
                <EField value={form.location} onChangeText={set('location')} placeholder="Delivery address or venue" accessibilityLabel="Location" />
              </Field>
              <View>
                <Text style={[sans(12, 500), styles.dietLabel]}>
                  Dietary requirements <Text style={[sans(12), { color: colors.textWarmMuted }]}>(optional)</Text>
                </Text>
                <View style={styles.chips}>
                  {DIETARY_OPTIONS.map((d) => {
                    const on = form.dietary.includes(d.name);
                    return <Chip key={d.name} tone="espresso" label={d.name} selected={on} onPress={() => set('dietary')(on ? form.dietary.filter((x) => x !== d.name) : [...form.dietary, d.name])} />;
                  })}
                </View>
              </View>
              <Field label="Enquiry">
                <EField value={form.notes} onChangeText={set('notes')} placeholder="Tell us about the event, timings and anything we should know." multiline height={104} accessibilityLabel="Enquiry" error={errors.notes} />
              </Field>
              {Object.values(errors).some(Boolean) ? <AlertBox>Please fill in the highlighted fields so we can get back to you.</AlertBox> : null}
              {submitError ? <AlertBox>{submitError}</AlertBox> : null}
              <Button label="Submit enquiry" variant="espresso" onPress={submit} loading={create.isPending} height={54} radius={12} weight={500} fontSize={15} />
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
      />
    </Screen>
  );
}

function EField(props: React.ComponentProps<typeof TextField>) {
  return <TextField tone="espresso" height={46} background={colors.sandstoneCard} style={styles.inputPad} {...props} />;
}

function Chevron({ open }: { open: boolean }) {
  const r = useDerivedValue(() => withTiming(open ? 180 : 0, { duration: 350 }), [open]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDownSoft" size={13} strokeWidth={1.8} color={colors.espresso} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fill: { width: '100%', height: '100%' },
  center: { textAlign: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  content: { paddingBottom: 36 },
  row2: { flexDirection: 'row', gap: 12 },
  intro: { paddingTop: 10, paddingHorizontal: 20 },
  h2: { marginTop: 12, color: colors.espressoText },
  lede: { marginTop: 14, color: colors.espresso },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 12, marginTop: 20 },
  tab: { paddingBottom: 7, borderBottomWidth: 1 },
  pkg: { paddingTop: 20, paddingHorizontal: 20 },
  pkgPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.linenDeep },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: espressoA(0.14) },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  incl: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: espressoA(0.22) },
  inclBody: { paddingTop: 14 },
  inclList: { marginTop: 8 },
  inclItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: espressoA(0.1), color: colors.espressoText },
  enquire: { marginTop: 16 },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 26, marginTop: 30, marginHorizontal: 20, paddingVertical: 26, paddingHorizontal: 8, borderRadius: 12, backgroundColor: colors.linenDeep },
  highlight: { width: '50%', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  hIcon: { width: 44, height: 44 },
  hSub: { marginTop: 5, color: colors.textWarmMuted },
  formIntro: { paddingTop: 36, paddingHorizontal: 20 },
  kicker: { marginBottom: 10, color: colors.caramelDeep },
  spread: { width: '100%', aspectRatio: 9 / 5, borderRadius: 10, marginTop: 20 },
  card: { gap: 14, marginTop: 18, marginHorizontal: 16, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20, borderWidth: 1, borderColor: espressoA(0.12), borderRadius: 10, backgroundColor: colors.sandstoneCard },
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  half: { flexBasis: '45%', flexGrow: 1 },
  full: { width: '100%' },
  contactSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: espressoA(0.14), backgroundColor: colors.sandstone },
  contactLine: { marginTop: 3, color: colors.textWarmMuted },
  estimate: { marginTop: -4, color: colors.textWarmMuted },
  dietLabel: { marginBottom: 8, color: colors.espressoText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  inputPad: { paddingHorizontal: 12 },
});
