import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '@/components/layout/BottomSheet';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { monthGrid, shiftMonth, WEEKDAY_INITIALS } from '@/domain/calendar';
import { colors, espressoA, sans } from '@/theme';
import type { ISODate } from '@/types';
import { parseISODate } from '@/utils/datetime';

interface CalendarSheetProps {
  visible: boolean;
  selected: ISODate | null;
  onSelect: (date: ISODate) => void;
  onClose: () => void;
  /** Footnote shown under the grid (Reserve shows the 12-hour notice rule). */
  note?: string;
}

/** Month calendar from the website (Monday-first, today ringed, from tomorrow onwards). */
export function CalendarSheet({ visible, selected, onSelect, onClose, note }: CalendarSheetProps) {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => (selected ? parseISODate(selected) : new Date()));
  // Re-open on the selected date's month (state adjusted during render on prop change).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && selected) setMonth(parseISODate(selected));
  }
  const grid = useMemo(() => monthGrid(month, selected), [month, selected]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Choose a date"
      backgroundColor={colors.sandstone}
      backdropColor="rgba(58,43,36,0.35)"
      radius={18}
      duration={220}
      panelStyle={styles.panel}
    >
      <View style={[styles.body, { paddingBottom: Math.max(34, insets.bottom + 12) }]}>
        <View style={styles.head}>
          <Touchable onPress={() => setMonth((m) => shiftMonth(m, -1))} accessibilityLabel="Previous month" pressedScale={1} style={styles.nav}>
            <Text style={[sans(18), { color: colors.espresso }]}>‹</Text>
          </Touchable>
          <Text accessibilityRole="header" style={[sans(17), { color: colors.espressoText }]}>
            {grid.title}
          </Text>
          <Touchable onPress={() => setMonth((m) => shiftMonth(m, 1))} accessibilityLabel="Next month" pressedScale={1} style={styles.nav}>
            <Text style={[sans(18), { color: colors.espresso }]}>›</Text>
          </Touchable>
        </View>
        <View style={styles.week}>
          {WEEKDAY_INITIALS.map((d, i) => (
            <Text key={i} style={[sans(10, 500, undefined, 0.08), styles.dow]}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {grid.cells.map((c, i) => (
            <View key={c.date ?? `blank-${i}`} style={styles.cellWrap}>
              {c.date ? (
                <Touchable
                  disabled={c.disabled}
                  onPress={() => onSelect(c.date!)}
                  pressedScale={1}
                  accessibilityState={{ selected: c.selected, disabled: c.disabled }}
                  accessibilityLabel={c.date}
                  style={[
                    styles.cell,
                    c.selected && { backgroundColor: colors.espresso },
                    c.isToday && !c.selected && { borderWidth: 1, borderColor: 'rgba(201,137,81,0.7)' },
                  ]}
                >
                  <Text style={[sans(13, c.selected ? 500 : 400), { color: c.selected ? colors.sandstone : c.disabled ? '#C9BEB0' : colors.espressoText }]}>{c.label}</Text>
                </Touchable>
              ) : null}
            </View>
          ))}
        </View>
        {note ? <Text style={[sans(11, 400, 1.4), styles.note]}>{note}</Text> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1, borderColor: espressoA(0.18) },
  body: { paddingTop: 18, paddingHorizontal: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: espressoA(0.14), alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', marginBottom: 4 },
  dow: { flex: 1, textAlign: 'center', paddingVertical: 4, color: colors.textWarmMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cellWrap: { width: `${100 / 7}%`, height: 44, alignItems: 'center' },
  cell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: 12, color: colors.textWarmMuted },
});
