// Usage: node scripts/export-mock-data.mjs path/to/mock-data.js output.json [order-rules.json]
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const [input, output, rulesFile] = process.argv.slice(2);
if (!input || !output) throw new Error('Provide the mock-data.js path and output JSON path.');
const source = (await readFile(input, 'utf8'))
  .replace(/\bexport\s+(?=(?:const|let|var)\b)/g, '')
  .replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
const result = vm.runInNewContext(`${source}\nJSON.stringify({ LOCATIONS, CATEGORIES, MENU, CATERING, ...(typeof ORDER_RULES !== 'undefined' ? { ORDER_RULES } : {}) });`, {}, { timeout: 2000 });
const data = JSON.parse(result);
if (rulesFile) data.ORDER_RULES = JSON.parse(await readFile(rulesFile, 'utf8'));
await writeFile(output, JSON.stringify(data, null, 2) + '\n');
console.log(`Exported ${data.LOCATIONS.length} locations, ${data.MENU.length} menu items to ${output}.`);
