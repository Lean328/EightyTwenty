/**
 * On a phone, a string or number rendered straight inside a View is an error ("Text strings
 * must be rendered within a <Text> component"): a red screen in development, a crash in a
 * store build. React Native Web renders it happily, so the web preview never shows it.
 * Classic case: `{count && <Badge />}` renders a bare 0. This uses the type checker to find
 * JSX children that can be a string/number outside a <Text>.
 */
import { unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(__dirname, '..', '..');
const APP_TSX = /[\\/](src|app)[\\/].*\.tsx$/;
/** Elements whose children end up inside a native Text (custom ones checked by hand). */
const TEXT_TAGS = new Set(['Text', 'Animated.Text', 'RNText', 'TextPath', 'SvgText', 'TSpan', 'StepLabel', 'AlertBox', 'Info', 'FieldLabel']);

function program(files?: string[]) {
  const configPath = join(ROOT, 'tsconfig.json');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT);
  return ts.createProgram(files ?? parsed.fileNames.filter((f) => APP_TSX.test(f)), parsed.options);
}

const TEXTY = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike;
const EMPTY = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.BooleanLike | ts.TypeFlags.Void;
const parts = (type: ts.Type) => (type.isUnion() ? type.types : [type]);

/** Can this value be a string/number (e.g. the left side of `count && …`)? */
const canBeText = (type: ts.Type) => parts(type).some((t) => (t.flags & TEXTY) !== 0);

/** Only ever text or nothing — a string/number rendered as a child, not a ReactNode pass-through. */
const onlyText = (type: ts.Type) => canBeText(type) && parts(type).every((t) => (t.flags & (TEXTY | EMPTY)) !== 0);

/** Why this JSX child can render text outside <Text>, or null. */
function textRisk(expr: ts.Expression, checker: ts.TypeChecker): string | null {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && canBeText(checker.getTypeAtLocation(e.left))) {
    return 'left side of && can be a string/number (renders e.g. a bare 0)';
  }
  return onlyText(checker.getTypeAtLocation(e)) ? 'is a string/number' : null;
}

function findings(files?: string[]): string[] {
  const prog = program(files);
  const checker = prog.getTypeChecker();
  const out: string[] = [];
  for (const sf of prog.getSourceFiles()) {
    if (sf.isDeclarationFile || !APP_TSX.test(sf.fileName)) continue;
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText(sf);
        if (!TEXT_TAGS.has(tag)) {
          for (const child of node.children) {
            const where = `${relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(child.getStart(sf)).line + 1} in <${tag}>`;
            if (ts.isJsxText(child) && child.text.trim()) out.push(`${where}: bare text "${child.text.trim().slice(0, 30)}"`);
            if (ts.isJsxExpression(child) && child.expression) {
              const risk = textRisk(child.expression, checker);
              if (risk) out.push(`${where}: {${child.expression.getText(sf).slice(0, 60)}} ${risk}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

describe('text nodes', () => {
  it('never render a string or number outside <Text>', () => {
    expect(findings()).toEqual([]);
  }, 120_000);

  it('catches a bare 0 and loose text', () => {
    const fixture = join(ROOT, 'src', '__textNodeFixture.tsx');
    writeFileSync(
      fixture,
      [
        "import { Text, View } from 'react-native';",
        'export const A = ({ count, name }: { count: number; name: string }) => (',
        '  <View>',
        '    {count && <Text>items</Text>}',
        '    {name}',
        '    loose',
        '    <Text>{count}</Text>',
        '  </View>',
        ');',
      ].join('\n'),
    );
    try {
      const found = findings([fixture]);
      expect(found).toHaveLength(3);
      expect(found[0]).toContain('bare 0');
    } finally {
      unlinkSync(fixture);
    }
  }, 120_000);
});
