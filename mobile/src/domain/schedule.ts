import type { TimeOfDay } from '@/types';
import { ORDER_RULES } from '@/constants/business';
import { formatTimeOfDay, pad2 } from '@/utils/format';

export interface TimeSlot {
  value: TimeOfDay;
  label: string;
}

/** Half-hour pickup slots for "Later today" (prototype: 7:00 am – 2:30 pm). */
export function scheduleSlots(from: number = ORDER_RULES.scheduleFromHour, to: number = ORDER_RULES.scheduleToHour): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let t = from; t <= to; t += 0.5) {
    const value = `${pad2(Math.floor(t))}:${t % 1 ? '30' : '00'}`;
    slots.push({ value, label: formatTimeOfDay(value) });
  }
  return slots;
}
