import { createElement } from 'react';
import { colors, espressoA, fontFamilies } from '@/theme';
import type { TimeOfDay } from '@/types';
import type { TimeFieldProps } from './TimeField';

/** Web preview: the browser's native time input, as in the original prototype. */
export function TimeField({ value, onChange, accessibilityLabel, invalid, height = 46 }: TimeFieldProps) {
  return createElement('input', {
    type: 'time',
    step: 60,
    value,
    'aria-label': accessibilityLabel,
    'aria-invalid': invalid,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value as TimeOfDay),
    style: {
      display: 'block',
      width: '100%',
      minWidth: 0,
      height,
      boxSizing: 'border-box',
      padding: '0 10px',
      borderRadius: 10,
      border: `1px solid ${invalid ? colors.dangerBright : espressoA(0.2)}`,
      background: colors.sandstoneCard,
      fontFamily: fontFamilies.sans[400],
      fontSize: 15,
      color: invalid ? colors.dangerBright : value ? colors.espressoText : colors.textWarmMuted,
      WebkitAppearance: 'none',
      appearance: 'none',
    },
  });
}
