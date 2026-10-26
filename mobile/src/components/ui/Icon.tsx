import { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

/**
 * EightyTwenty line icons — path data copied verbatim from the approved prototype
 * (24×24 viewBox, round caps/joins). `arrowLong` uses its own 30×10 viewBox.
 */
type Shape =
  | { t: 'path'; d: string; opacity?: number; fill?: boolean; strokeWidth?: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx: number };

const P = (d: string, extra?: Partial<Extract<Shape, { t: 'path' }>>): Shape => ({ t: 'path', d, ...extra });

const CUP_BODY = 'M4.5 9h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z';
const CUP_HANDLE = 'M15.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.5';
const CUP_STEAM = 'M8 5.5c0-1 1-1 1-2M12 5.5c0-1 1-1 1-2';

export const ICONS = {
  pin: [P('M12 21.5s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z'), { t: 'circle', cx: 12, cy: 10.5, r: 2.3 }],
  chevronDown: [P('M6 9l6 6 6-6')],
  chevronDownSoft: [P('M6.5 9.5L12 15l5.5-5.5')],
  chevronRight: [P('M9 6l6 6-6 6')],
  back: [P('M15 5l-7 7 7 7')],
  close: [P('M6 6l12 12M18 6 6 18')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  plus: [P('M12 5v14M5 12h14')],
  minus: [P('M5 12h14')],
  trash: [P('M5 7h14M9.5 7V5h5v2M7 7l1 13h8l1-13')],
  bag: [P('M5.5 8.5h13l1 12.5h-15z'), P('M9 8.5V7a3 3 0 0 1 6 0v1.5')],
  bell: [P('M6 10a6 6 0 0 1 12 0v4l1.6 2.6c.3.6-.1 1.4-.8 1.4H5.2c-.7 0-1.1-.8-.8-1.4L6 14z'), P('M10 20.5a2 2 0 0 0 4 0')],
  cup: [P(CUP_BODY), P(CUP_HANDLE), P(CUP_STEAM)],
  cupPlain: [P(CUP_BODY), P(CUP_HANDLE)],
  calendar: [{ t: 'rect', x: 4, y: 5.5, w: 16, h: 15, rx: 2 }, P('M4 10.5h16M8.5 3.5v4M15.5 3.5v4')],
  tag: [P('M3.5 12.5V4.5h8l9 9-8 8z'), { t: 'circle', cx: 8, cy: 9, r: 1.2 }],
  gift: [{ t: 'rect', x: 4, y: 9, w: 16, h: 11, rx: 1.5 }, P('M3 9h18M12 9v11M12 9S9.5 4.5 7.5 5.5 9 9 12 9zm0 0s2.5-4.5 4.5-3.5S15 9 12 9z')],
  card: [{ t: 'rect', x: 3, y: 6, w: 18, h: 13, rx: 2 }, P('M3 10.5h18')],
  clock: [{ t: 'circle', cx: 12, cy: 12, r: 8.5 }, P('M12 7.5V12l3 2')],
  barcode: [P('M4 6v12M8 6v12M11 6v12M14.5 6v12M17 6v12M20 6v12')],
  person: [{ t: 'circle', cx: 12, cy: 8, r: 4 }, P('M4.5 20.5a7.5 7.5 0 0 1 15 0')],
  receipt: [P('M6 3.5h12v17l-3-2-3 2-3-2-3 2z'), P('M9 8.5h6M9 12h6')],
  catering: [P('M4 16a8 8 0 0 1 16 0'), P('M2.5 19h19M12 8V5.5')],
  shield: [P('M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z')],
  wallet: [{ t: 'rect', x: 3.5, y: 6, w: 17, h: 13, rx: 2.5 }, P('M3.5 10h17M15.5 14.5h2')],
  leaf: [P('M5 19c0-8 5-13 14-14 0 9-5 14-13 14z'), P('M5 19c3-4 6-6.5 9-8')],
  heart: [P('M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z')],
  home: [P('M4 11.2 12 4.5l8 6.7V20H4z'), P('M10 20v-5.5h4V20')],
  help: [{ t: 'circle', cx: 12, cy: 12, r: 8.5 }, P('M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.7'), P('M12 17h.01')],
  chat: [P('M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z')],
  document: [P('M6.5 3.5h8l4 4v13h-12z'), P('M14.5 3.5v4h4M9 12h6M9 15.5h6')],
  signOut: [P('M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9')],
  pencil: [P('M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z')],
  phone: [P('M5 4.5h4l1.5 4-2.2 1.4a11 11 0 0 0 5.8 5.8l1.4-2.2 4 1.5v4a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z')],
  mail: [{ t: 'rect', x: 3.5, y: 5.5, w: 17, h: 13, rx: 2 }, P('M4 7l8 6 8-6')],
  menu: [
    { t: 'circle', cx: 12, cy: 4.6, r: 1.4 },
    P('M12 6v1.7'),
    P('M4.5 15.2a7.5 7.5 0 0 1 15 0'),
    P('M3 15.2h18'),
    P('M8.5 19h7'),
    P('M7.6 13.4a5.4 5.4 0 0 1 3.6-4.1', { opacity: 0.6 }),
  ],
  loyalty: [
    P('M20.6 12A2.4 2.4 0 0 1 19.45 16.3A2.4 2.4 0 0 1 16.3 19.45A2.4 2.4 0 0 1 12 20.6A2.4 2.4 0 0 1 7.7 19.45A2.4 2.4 0 0 1 4.55 16.3A2.4 2.4 0 0 1 3.4 12A2.4 2.4 0 0 1 4.55 7.7A2.4 2.4 0 0 1 7.7 4.55A2.4 2.4 0 0 1 12 3.4A2.4 2.4 0 0 1 16.3 4.55A2.4 2.4 0 0 1 19.45 7.7A2.4 2.4 0 0 1 20.6 12Z'),
    P('M12 8.2 13.06 10.94 16 11.1 13.71 12.96 14.47 15.8 12 14.2 9.53 15.8 10.29 12.96 8 11.1 10.94 10.94Z', { fill: true, strokeWidth: 1 }),
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Fill for closed shapes (e.g. the favourite heart). */
  fill?: string;
}

export const Icon = memo(function Icon({ name, size = 24, color = colors.ink, strokeWidth = 1.7, fill = 'none' }: IconProps) {
  const shapes = ICONS[name] as readonly Shape[];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes.map((s, i) => {
        if (s.t === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fill} />;
        if (s.t === 'rect') return <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={fill} />;
        return <Path key={i} d={s.d} opacity={s.opacity} fill={s.fill ? color : fill} strokeWidth={s.strokeWidth} />;
      })}
    </Svg>
  );
});

/** The long editorial arrow used by "See all ⟶" links (30×10). */
export function ArrowLong({ color = colors.ink, width = 30 }: { color?: string; width?: number }) {
  return (
    <Svg width={width} height={10} viewBox="0 0 30 10" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M0 5h28" />
      <Path d="M24 1l4 4-4 4" />
    </Svg>
  );
}
