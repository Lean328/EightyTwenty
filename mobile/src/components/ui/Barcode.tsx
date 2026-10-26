import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';
import { code128Widths } from '@/utils/code128';

// The prototype's decorative bars, shown until the member number has loaded.
const BARS =
  'M4 0v44M9 0v44M16 0v44M19 0v44M27 0v44M33 0v44M37 0v44M44 0v44M51 0v44M55 0v44M62 0v44M66 0v44M73 0v44M80 0v44M84 0v44M91 0v44M98 0v44M102 0v44M108 0v44M115 0v44M119 0v44M126 0v44M131 0v44M138 0v44M144 0v44M149 0v44M156 0v44M161 0v44M168 0v44M173 0v44M179 0v44M186 0v44M190 0v44M196 0v44';
/** Blank modules each side so scanners find the start and stop patterns. */
const QUIET = 10;

/** Scannable Code 128 of `value` (the member number, as BOS searches it). */
export function Barcode({ value, height = 56, color = colors.ink }: { value?: string; height?: number; color?: string }) {
  const widths = value ? code128Widths(value) : null;
  if (!widths) {
    return (
      <Svg width="100%" height={height} viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden>
        <Path d={BARS} stroke={color} strokeWidth={2.4} />
      </Svg>
    );
  }
  const total = widths.reduce((a, b) => a + b, 0) + QUIET * 2;
  const bars: { x: number; w: number }[] = [];
  let x = QUIET;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${total} 44`} preserveAspectRatio="none" aria-hidden>
      {bars.map((b) => (
        <Rect key={b.x} x={b.x} y={0} width={b.w} height={44} fill={color} />
      ))}
    </Svg>
  );
}
