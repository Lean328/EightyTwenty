import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { FadeIn, Reveal } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { buildLine } from '@/domain/cart';
import { isLiveStatus, STATUS_LABEL } from '@/domain/orders';
import { useCateringEnquiries } from '@/features/catering/hooks';
import { useLocations } from '@/features/locations/hooks';
import { useMenuIndex } from '@/features/menu/hooks';
import { useOrderHistory } from '@/features/orders/hooks';
import { useCancelReservation, useReservations } from '@/features/reservations/hooks';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useNow } from '@/hooks/useNow';
import { openPhone } from '@/services/integrations/links';
import { useCartStore } from '@/store/cart';
import { showToast } from '@/store/ui';
import { caramelA, colors, eyebrow, inkA, sans, serif } from '@/theme';
import type { Order, Reservation } from '@/types';
import { dayShort, formatActivityTime, formatDayMonth, formatSentDay, monthShort, parseISODate, toISODate } from '@/utils/datetime';
import { formatMoney, formatTimeOfDay } from '@/utils/format';

const SEGMENTS = ['orders', 'reservations', 'catering'] as const;
type Segment = (typeof SEGMENTS)[number];
const isSegment = (v: unknown): v is Segment => SEGMENTS.includes(v as Segment);

/** Orders · Reservations · Catering history. `?segment=` opens a tab (deep links, Profile rows). */
export function ActivityScreen() {
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(isSegment(params.segment) ? params.segment : 'orders');
  const bottom = useBottomSpace(132);
  return (
    <Screen>
      <ScreenHeader title="Activity" />
      <View style={styles.segWrap}>
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          segments={[
            { value: 'orders', label: 'Orders' },
            { value: 'reservations', label: 'Reservations' },
            { value: 'catering', label: 'Catering' },
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        {segment === 'orders' ? <OrdersSegment /> : segment === 'reservations' ? <ReservationsSegment /> : <CateringSegment />}
      </ScrollView>
    </Screen>
  );
}

function LoadingCards() {
  return (
    <View style={styles.stack}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skelCard}>
          <Skeleton style={styles.skelThumb} />
          <View style={styles.skelText}>
            <Skeleton delay={100} style={{ width: '70%', height: 12, borderRadius: 5 }} />
            <Skeleton delay={200} style={{ width: '45%', height: 10, borderRadius: 5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function OrdersSegment() {
  const orders = useOrderHistory();
  const menu = useMenuIndex();
  const now = useNow();
  const [open, setOpen] = useState<string | null>(null);
  const list = orders.data?.pages.flatMap((p) => p.items) ?? [];

  const reorder = (order: Order) => {
    const lines = order.lines.flatMap((l) => {
      const item = menu.get(l.itemId);
      return item ? [buildLine(item, l.selections, l.qty, l.note)] : [];
    });
    useCartStore.getState().replaceLines(lines);
    router.push('/cart');
    showToast('Order rebuilt — review and check out');
  };

  if (orders.isLoading) return <LoadingCards />;
  if (!list.length) return <EmptyState icon="receipt" title="No orders yet" body="Your EightyTwenty orders will appear here." />;

  return (
    <FadeIn duration={220} style={styles.stack}>
      {list.map((o) => {
        const isOpen = open === o.id;
        const thumbs = o.lines.map((l) => menu.get(l.itemId)?.image).filter(Boolean).slice(0, 3);
        const tone = o.status === 'completed' ? 'success' : o.status === 'declined' ? 'danger' : 'pending';
        return (
          <View key={o.id} style={styles.card}>
            {/* Tapping the order opens its status screen (live progress, or the outcome). */}
            <Touchable onPress={() => router.push(`/orders/${o.id}`)} pressedScale={0.99} accessibilityLabel={`Order ${o.number}, ${STATUS_LABEL[o.status]}. View status`} style={styles.orderTop}>
              <View style={styles.thumbs}>
                {thumbs.map((src, i) => (
                  <View key={i} style={styles.thumb}>
                    <Image source={src!} style={styles.fill} contentFit="cover" />
                  </View>
                ))}
              </View>
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[sans(14, 600, 1.3), { color: colors.ink }]}>
                  {o.lines.map((l) => l.name).join(' + ')}
                </Text>
                <Text style={[sans(12, 400, 1.3), styles.meta]}>
                  {o.locationName} · {formatActivityTime(o.createdAt, now)}
                </Text>
              </View>
              <Text style={[sans(14, 600), { color: colors.ink }]}>{formatMoney(o.totals.total)}</Text>
            </Touchable>
            <View style={styles.orderBottom}>
              <StatusChip label={`${STATUS_LABEL[o.status]} · ${o.method}`} tone={tone} />
              <View style={styles.orderActions}>
                <Touchable onPress={() => setOpen(isOpen ? null : o.id)} accessibilityState={{ expanded: isOpen }} style={styles.details}>
                  <Text style={[sans(13, 600), { color: colors.textSecondary }]}>Details</Text>
                  <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                    <Icon name="chevronDown" size={13} strokeWidth={2.2} color={colors.textSecondary} />
                  </View>
                </Touchable>
                {isLiveStatus(o.status) ? (
                  <Touchable onPress={() => router.push(`/orders/${o.id}`)} style={styles.details}>
                    <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Track</Text>
                  </Touchable>
                ) : (
                  <Touchable onPress={() => reorder(o)} style={styles.details}>
                    <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Reorder</Text>
                  </Touchable>
                )}
              </View>
            </View>
            {isOpen ? (
              <Reveal style={styles.lines}>
                {o.lines.map((l, i) => (
                  <View key={i} style={styles.line}>
                    <Text style={[sans(13, 400, 1.4), { color: colors.textSecondary }]}>{l.qty}×</Text>
                    <Text style={[sans(13, 400, 1.4), styles.flexInk]}>
                      {l.name}
                      {l.modifiersLabel ? <Text style={{ color: colors.textSecondary }}> · {l.modifiersLabel}</Text> : null}
                    </Text>
                    <Text style={sans(13, 400, 1.4)}>{formatMoney(l.unitPrice * l.qty)}</Text>
                  </View>
                ))}
                <Text style={[sans(12, 400, 1.4), { color: colors.textMuted }]}>Order {o.number}</Text>
              </Reveal>
            ) : null}
          </View>
        );
      })}
    </FadeIn>
  );
}

function ReservationsSegment() {
  const { data: reservations = [], isLoading } = useReservations();
  const { data: locations = [] } = useLocations();
  const cancel = useCancelReservation();
  const today = toISODate(new Date());
  const sorted = [...reservations].sort((a, b) => (a.date < b.date ? -1 : 1));
  const upcoming = sorted.filter((r) => r.date >= today);
  const past = sorted.filter((r) => r.date < today);
  const loc = (r: Reservation) => locations.find((l) => l.id === r.locationId);
  const line = (r: Reservation) => `${formatTimeOfDay(r.time)} · ${r.guests} ${r.guests === 1 ? 'guest' : 'guests'} · ${r.seating}`;

  if (isLoading) return <LoadingCards />;
  return (
    <FadeIn duration={220}>
      {upcoming.length ? (
        <>
          <Text style={[eyebrow(10, 0.12), styles.groupLabel]}>Upcoming</Text>
          <View style={styles.stack}>
            {upcoming.map((r) => {
              const d = parseISODate(r.date);
              const confirmed = r.status === 'Confirmed';
              const l = loc(r);
              return (
                <View key={r.id} style={styles.resCard}>
                  <View style={styles.dateBlock}>
                    <Text style={[eyebrow(9.5, 0.1), { color: colors.sand }]}>{dayShort(d)}</Text>
                    <Text style={[serif(26, 400), { color: colors.creamText }]}>{d.getDate()}</Text>
                    <Text style={[sans(10, 500), { color: colors.creamText }]}>{monthShort(d)}</Text>
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.resHead}>
                      <Text style={[sans(15, 600, 1.2), { color: colors.ink }]}>{l?.name}</Text>
                      <StatusChip label={r.status} tone={confirmed ? 'success' : r.status === 'Cancelled' ? 'danger' : 'pending'} />
                    </View>
                    <Text style={[sans(13, 400, 1.35), styles.meta4]}>{line(r)}</Text>
                    <View style={styles.resActions}>
                      {confirmed && l?.phone ? (
                        <Touchable onPress={() => openPhone(l.phone!)} accessibilityRole="link" style={styles.details}>
                          <Text style={[sans(13, 600), { color: colors.caramelDeep }]}>Call café</Text>
                        </Touchable>
                      ) : null}
                      {r.status === 'Requested' ? (
                        <Touchable
                          onPress={() =>
                            cancel.mutate(r.id, {
                              onSuccess: () => showToast('Request cancelled'),
                            })
                          }
                          style={styles.details}
                        >
                          <Text style={[sans(13, 600), { color: colors.danger }]}>Cancel request</Text>
                        </Touchable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      {past.length ? (
        <>
          <Text style={[eyebrow(10, 0.12), styles.pastLabel]}>Past</Text>
          {past.map((r) => {
            const d = parseISODate(r.date);
            return (
              <View key={r.id} style={styles.pastRow}>
                <Text style={[sans(13, 400, 1.4), styles.flexMuted]}>
                  <Text style={[sans(13, 600, 1.4), { color: colors.ink }]}>{loc(r)?.name}</Text> · {line(r)}
                </Text>
                <Text style={[sans(13, 400, 1.4), { color: colors.textSecondary }]}>
                  {dayShort(d)} {d.getDate()} {monthShort(d)}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}
      {!reservations.length ? <EmptyState icon="calendar" title="No reservations yet" body="Book a table at any EightyTwenty café." style={styles.emptyTight} /> : null}
      <Button label="Reserve a table" variant="outline" onPress={() => router.push('/reserve')} style={styles.mt16} />
    </FadeIn>
  );
}

function CateringSegment() {
  const { data: enquiries = [], isLoading } = useCateringEnquiries();
  if (isLoading) return <LoadingCards />;
  return (
    <FadeIn duration={220}>
      {enquiries.length ? (
        <View style={styles.stack}>
          {enquiries.map((q) => (
            <View key={q.id} style={styles.card}>
              <View style={styles.resHead}>
                <Text style={[sans(15, 600, 1.2), { color: colors.ink }]}>{q.packageName}</Text>
                <StatusChip label={q.status} tone="pending" />
              </View>
              <Text style={[sans(13, 400, 1.4), styles.meta5]}>
                {q.guests ?? '—'} guests · {q.occasion}
                {q.date ? ` · ${formatDayMonth(parseISODate(q.date))}` : ''}
              </Text>
              <Text style={[sans(12, 400, 1.3), styles.sent]}>Sent {formatSentDay(q.createdAt)} · quote by email</Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon="catering" title="No catering requests yet" body="Breakfast, lunch and afternoon tea packages for your next event." style={styles.emptyTight} />
      )}
      <Button label="Plan catering" variant="outline" onPress={() => router.push('/catering')} style={styles.mt16} />
    </FadeIn>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'success' | 'pending' | 'danger' }) {
  const bg = tone === 'success' ? 'rgba(62,107,71,0.12)' : tone === 'danger' ? 'rgba(154,68,54,0.1)' : caramelA(0.16);
  const fg = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.caramelDeep;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[sans(11, 600), { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexInk: { flex: 1, minWidth: 0, color: colors.ink },
  flexMuted: { flex: 1, color: colors.textSecondary },
  fill: { width: '100%', height: '100%' },
  segWrap: { marginTop: 4, marginHorizontal: 20, paddingBottom: 10 },
  stack: { gap: 10 },
  skelCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.06) },
  skelThumb: { width: 52, height: 52, borderRadius: 12 },
  skelText: { flex: 1, gap: 8, justifyContent: 'center' },
  card: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbs: { flexDirection: 'row', gap: 4 },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.linen },
  meta: { marginTop: 3, color: colors.textSecondary },
  meta4: { marginTop: 4, color: colors.textSecondary },
  meta5: { marginTop: 5, color: colors.textSecondary },
  sent: { marginTop: 6, color: colors.textMuted },
  orderBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  orderActions: { flexDirection: 'row', gap: 18 },
  details: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  lines: { gap: 7, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: inkA(0.07) },
  line: { flexDirection: 'row', gap: 8 },
  chip: { height: 24, paddingHorizontal: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupLabel: { marginTop: 6, marginBottom: 10, color: colors.textMuted },
  pastLabel: { marginTop: 22, marginBottom: 10, color: colors.textMuted },
  resCard: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  dateBlock: { width: 56, height: 68, borderRadius: 12, backgroundColor: colors.espresso, alignItems: 'center', justifyContent: 'center', gap: 3 },
  resHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  pastRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  emptyTight: { paddingVertical: 48, paddingHorizontal: 24 },
  mt16: { marginTop: 16 },
});
