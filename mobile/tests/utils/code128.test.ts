import { code128BValues, code128Widths } from '@/utils/code128';

/** Bars first: 1 = bar module, 0 = space module. */
const modules = (widths: number[]) => widths.map((w, i) => (i % 2 ? '0' : '1').repeat(w)).join('');

describe('Code 128 B', () => {
  it('encodes a member number exactly like a reference encoder (JsBarcode CODE128B)', () => {
    expect(modules(code128Widths('8020 1234 5678')!)).toBe('110100100001110100110010011101100110011100101001110110011011001100100111001101100111001011001011100110010011101101100110011011100100110011101001110110111011101001100110001001001100011101011');
  });

  it('adds the mod-103 checksum and every symbol is 11 modules wide', () => {
    const values = code128BValues('8020 1234 5678')!;
    expect(values[0]).toBe(104);
    expect(values).toHaveLength(14 + 2);
    const widths = code128Widths('8020 1234 5678')!;
    expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * 16 + 13);
  });

  it('refuses text set B cannot hold', () => {
    expect(code128Widths('')).toBeNull();
    expect(code128Widths('café')).toBeNull();
  });
});
