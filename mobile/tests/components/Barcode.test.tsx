import { render } from '@testing-library/react-native';
import { Barcode } from '@/components/ui/Barcode';

type Node = { type: string; children?: (Node | string)[] | null };

/** Host element types in the rendered tree (react-native-svg renders RNSVG* views). */
function types(node: Node | Node[] | null, out: string[] = []): string[] {
  for (const n of Array.isArray(node) ? node : node ? [node] : []) {
    out.push(n.type);
    for (const child of n.children ?? []) if (typeof child !== 'string') types(child, out);
  }
  return out;
}

const count = (all: string[], kind: string) => all.filter((t) => t.toLowerCase().endsWith(kind)).length;

describe('Barcode', () => {
  it('draws the member number as Code 128: 16 symbols × 3 bars + 4 in the stop pattern', async () => {
    const all = types((await render(<Barcode value="8020 1234 5678" />)).toJSON() as Node);
    expect(count(all, 'rect')).toBe(16 * 3 + 4);
    expect(count(all, 'path')).toBe(0);
  });

  it('keeps the decorative bars until the member number has loaded', async () => {
    const all = types((await render(<Barcode />)).toJSON() as Node);
    expect(count(all, 'rect')).toBe(0);
    expect(count(all, 'path')).toBe(1);
  });
});
