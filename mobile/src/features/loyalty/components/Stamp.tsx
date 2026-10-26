import { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText, TextPath } from 'react-native-svg';
import { caramelA, colors, fontFamilies, inkA } from '@/theme';

export type StampState = 'filled' | 'next' | 'empty';

const PALETTE: Record<StampState, { fill: string; ring: string; inner: string; ink: string; hi: string }> = {
  filled: { fill: colors.espresso, ring: 'rgba(75,46,38,0.5)', inner: 'rgba(233,200,158,0.55)', ink: colors.creamText, hi: 'rgba(245,237,226,0.06)' },
  next: { fill: 'transparent', ring: colors.caramel, inner: caramelA(0.45), ink: caramelA(0.85), hi: 'transparent' },
  empty: { fill: '#F1EBE0', ring: inkA(0.22), inner: inkA(0.1), ink: inkA(0.22), hi: 'transparent' },
};

/** Rubber-stamp roundel: "EIGHTY TWENTY" on an arc, cup, "CANBERRA" (verbatim prototype SVG). */
export const Stamp = memo(function Stamp({ n, state, rotate }: { n: number; state: StampState; rotate: number }) {
  const p = PALETTE[state];
  const id = `lp${n}`;
  return (
    <Svg width={62} height={62} viewBox="0 0 64 64" style={{ transform: [{ rotate: `${rotate}deg` }] }}>
      <Path id={id} d="M12.5 32A19.5 19.5 0 1 1 51.5 32" fill="none" />
      <Circle cx={32} cy={32} r={30} fill={p.fill} stroke={p.ring} strokeWidth={1.3} strokeDasharray="2.2 2.6" />
      <Circle cx={32} cy={32} r={25.5} fill="none" stroke={p.inner} strokeWidth={1} />
      <Circle cx={32.7} cy={31.4} r={25.5} fill="none" stroke={p.inner} strokeWidth={0.6} opacity={0.45} />
      <Ellipse cx={25} cy={23} rx={12} ry={7} fill={p.hi} />
      <SvgText fontFamily={fontFamilies.sans[600]} fontSize={5} letterSpacing={0.9} fill={p.ink} opacity={0.85} textAnchor="middle">
        <TextPath href={`#${id}`} startOffset="50%">
          EIGHTY TWENTY
        </TextPath>
      </SvgText>
      <G transform="translate(21.5 23) scale(.9)" fill="none" stroke={p.ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M4.5 9h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
        <Path d="M15.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.5" />
        <Path d="M8 5.5c0-1 1-1 1-2M12 5.5c0-1 1-1 1-2" />
      </G>
      <SvgText x={32} y={50.5} fontFamily={fontFamilies.sans[600]} fontSize={4.4} letterSpacing={1.3} textAnchor="middle" fill={p.ink} opacity={0.7}>
        CANBERRA
      </SvgText>
    </Svg>
  );
});
