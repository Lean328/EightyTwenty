import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rise } from '@/components/layout/Rise';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { isComingSoon } from '@/domain/hours';
import { useBottomSpace } from '@/hooks/useBottomSpace';
import { useGoToTab } from '@/navigation/tabNavigation';
import { mapsUrl, openPhone, openUrl } from '@/services/integrations/links';
import { colors, eyebrow, inkA, sans, serif, shadows } from '@/theme';
import { STATUS_COLORS, useChooseCafe, useLocation, useLocationStatus } from '../hooks';

/** Café detail: full-bleed photo, status, Order here / Book a table, hours, phone, services, maps. */
export function CafeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const goToTab = useGoToTab();
  const choose = useChooseCafe();
  const bottom = useBottomSpace(132);
  const { data: loc, isLoading } = useLocation(id);
  const status = useLocationStatus(loc);

  if (!loc) {
    return (
      <Screen>
        {isLoading ? null : <EmptyState icon="pin" title="Café not found" body="This café may have moved or closed." actionLabel="Our cafés" onAction={() => router.replace('/cafes')} />}
      </Screen>
    );
  }
  const soon = isComingSoon(loc);

  const rows: { label: string; value: string; onPress?: () => void; accent?: boolean }[] = [
    { label: 'Hours', value: loc.hoursLabel },
    { label: 'Phone', value: loc.phone ?? '—', onPress: loc.phone ? () => openPhone(loc.phone!) : undefined },
    { label: 'Services', value: loc.methods.join(' · ') },
    { label: 'Directions', value: 'Open in Maps', onPress: () => openUrl(mapsUrl(loc.address)), accent: true },
  ];

  return (
    <Screen top="none" statusBar="dark">
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>{loc.image ? <Image source={loc.image} style={styles.fill} contentFit="cover" transition={200} /> : null}</View>
        <Rise delay={50} duration={340} style={styles.body}>
          <Text style={[eyebrow(10, 0.12), { color: colors.caramelDeep }]}>{loc.subtitle}</Text>
          <View style={styles.titleRow}>
            <Text accessibilityRole="header" style={[serif(34, 400, 1, -0.01), { color: colors.ink, flexShrink: 1 }]}>
              {loc.name}
            </Text>
            <Text style={[sans(12, 500), { color: STATUS_COLORS[status.tone] }]}>{status.label}</Text>
          </View>
          <Text style={[sans(14, 400, 1.5), styles.address]}>{loc.address}</Text>
          {soon ? (
            <View style={styles.soon}>
              <Text style={[sans(13, 500, 1.45), { color: colors.ink }]}>Opening soon — ordering and bookings open when hours are confirmed.</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Button
                label="Order here"
                onPress={() => {
                  choose(loc, { silent: true, resetMethod: true });
                  goToTab('menu');
                }}
                style={styles.flex}
              />
              <Button label="Book a table" variant="outline" onPress={() => router.push({ pathname: '/reserve', params: { locationId: loc.id } })} style={styles.flex} />
            </View>
          )}
          <View style={styles.info}>
            {rows.map((r, i) => {
              const content = (
                <>
                  <Text style={[sans(14, 400, 1.45), styles.infoLabel]}>{r.label}</Text>
                  <Text style={[sans(14, r.onPress ? (r.accent ? 600 : 500) : 400, 1.45), { flex: 1, color: r.accent ? colors.caramelDeep : colors.ink }]}>{r.value}</Text>
                </>
              );
              return r.onPress ? (
                <Touchable key={r.label} onPress={r.onPress} pressedScale={1} accessibilityRole="link" style={[styles.infoRow, i > 0 && styles.infoSep]}>
                  {content}
                </Touchable>
              ) : (
                <View key={r.label} style={[styles.infoRow, i > 0 && styles.infoSep]}>
                  {content}
                </View>
              );
            })}
          </View>
        </Rise>
      </ScrollView>
      <Touchable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel="Back" style={[styles.back, { top: insets.top + 6 }]}>
        <Icon name="back" size={20} strokeWidth={1.9} />
      </Touchable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  hero: { height: 330, backgroundColor: colors.linen },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center', ...shadows.backButton },
  body: { paddingTop: 20, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 10 },
  address: { marginTop: 10, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  soon: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.linen },
  info: { marginTop: 22, paddingVertical: 4, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ivory, borderWidth: 1, borderColor: inkA(0.08) },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  infoSep: { borderTopWidth: 1, borderTopColor: inkA(0.07) },
  infoLabel: { width: 88, color: colors.textMuted },
});
