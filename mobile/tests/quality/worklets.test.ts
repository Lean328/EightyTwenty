/**
 * Worklets (useAnimatedStyle & co.) run on the UI thread on a phone. Calling an ordinary JS
 * function there (a theme helper like inkA(), a formatter…) is a fatal error on iOS/Android —
 * Expo Go simply quits — while the web build runs worklets on the JS thread and hides it.
 * This walks every source file and fails on such calls.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = join(__dirname, '..', '..');
const WORKLET_HOOKS = new Set(['useAnimatedStyle', 'useDerivedValue', 'useAnimatedProps', 'useAnimatedReaction', 'useAnimatedScrollHandler', 'useFrameCallback']);
/** Animation helpers whose last function argument is a completion worklet. */
const CALLBACK_HELPERS = new Set(['withTiming', 'withSpring', 'withDecay']);
const SAFE_MODULES = new Set(['react-native-reanimated', 'react-native-worklets']);
const SAFE_GLOBALS = new Set(['Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'console']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [full] : [];
  });
}

const isWorkletFunction = (fn: ts.Node): boolean =>
  (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)) &&
  !!fn.body &&
  ts.isBlock(fn.body) &&
  fn.body.statements.some((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === 'worklet');

function violations(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const safe = new Set<string>(SAFE_GLOBALS);
  sf.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && SAFE_MODULES.has(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      if (clause?.name) safe.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((e) => safe.add(e.name.text));
      if (bindings && ts.isNamespaceImport(bindings)) safe.add(bindings.name.text);
    }
  });
  const visitAll = (node: ts.Node, fn: (n: ts.Node) => void) => {
    fn(node);
    node.forEachChild((child) => visitAll(child, fn));
  };
  visitAll(sf, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isWorkletFunction(node)) safe.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isWorkletFunction(node.initializer)) safe.add(node.name.text);
  });

  const found: string[] = [];
  const checkBody = (fn: ts.Node) =>
    visitAll(fn, (n) => {
      if (!ts.isCallExpression(n)) return;
      const callee = n.expression;
      // Bare calls (inkA()) and calls on a bare name (theme.x()); deeper chains (p.value.toFixed()) are fine.
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression.text : null;
      if (name && !safe.has(name)) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        found.push(`${relative(ROOT, file)}:${line + 1} calls ${callee.getText()}() inside a worklet`);
      }
    });
  visitAll(sf, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
    const hook = node.expression.text;
    const fnArgs = node.arguments.filter((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    if (WORKLET_HOOKS.has(hook) && fnArgs[0]) checkBody(fnArgs[0]);
    if (CALLBACK_HELPERS.has(hook) && fnArgs.length) checkBody(fnArgs[fnArgs.length - 1]!);
  });
  return found;
}

describe('worklets', () => {
  it('never call non-worklet functions on the UI thread', () => {
    const all = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'app'))].flatMap(violations);
    expect(all).toEqual([]);
  });

  it('catches the Menu crash pattern', () => {
    const tmp = join(__dirname, '__fixture_bad.tsx');
    require('node:fs').writeFileSync(tmp, "import { useAnimatedStyle } from 'react-native-reanimated';\nimport { inkA } from '@/theme';\nexport const f = () => useAnimatedStyle(() => ({ borderColor: inkA(0.2) }));\n");
    try {
      expect(violations(tmp)).toEqual([expect.stringContaining('calls inkA() inside a worklet')]);
    } finally {
      require('node:fs').unlinkSync(tmp);
    }
  });
});
