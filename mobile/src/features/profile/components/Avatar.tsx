import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { serif } from '@/theme';
import { initialsOf } from '@/utils/format';

/** Profile icon palette (prototype AVATARS): three monogram colourways and three glyphs. */
export const AVATARS: { kind: 'initials' | IconName; bg: string; fg: string }[] = [
  { kind: 'initials', bg: '#4B2E26', fg: '#F5EDE2' },
  { kind: 'initials', bg: '#E9C89E', fg: '#4B2E26' },
  { kind: 'initials', bg: '#DCE3D3', fg: '#2F4A33' },
  { kind: 'cup', bg: '#ECE4D7', fg: '#1C1814' },
  { kind: 'leaf', bg: '#DCE3D3', fg: '#2F4A33' },
  { kind: 'heart', bg: '#F1DCD3', fg: '#7A3B2C' },
];

export function Avatar({ index, name, size, style }: { index: number; name: string; size: number; style?: StyleProp<ViewStyle> }) {
  const a = AVATARS[index] ?? AVATARS[0]!;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: a.bg }, style]}>
      {a.kind === 'initials' ? (
        <Text style={[serif(Math.round(size * 0.36), 400, undefined, 0.02), { color: a.fg }]}>{initialsOf(name)}</Text>
      ) : (
        <Icon name={a.kind} size={Math.round(size * 0.4)} strokeWidth={1.6} color={a.fg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ circle: { alignItems: 'center', justifyContent: 'center' } });
