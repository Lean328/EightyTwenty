import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

// Decorative barcode from the prototype. TODO(backend): render the member's real scannable
// code (Code 128 / QR) from the loyalty member number once the POS format is confirmed.
const BARS =
  'M4 0v44M9 0v44M16 0v44M19 0v44M27 0v44M33 0v44M37 0v44M44 0v44M51 0v44M55 0v44M62 0v44M66 0v44M73 0v44M80 0v44M84 0v44M91 0v44M98 0v44M102 0v44M108 0v44M115 0v44M119 0v44M126 0v44M131 0v44M138 0v44M144 0v44M149 0v44M156 0v44M161 0v44M168 0v44M173 0v44M179 0v44M186 0v44M190 0v44M196 0v44';

export function Barcode({ height = 56, color = colors.ink }: { height?: number; color?: string }) {
  return (
    <Svg width="100%" height={height} viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden>
      <Path d={BARS} stroke={color} strokeWidth={2.4} />
    </Svg>
  );
}
