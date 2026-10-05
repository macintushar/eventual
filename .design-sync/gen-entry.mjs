// Generates .design-sync/entry.ts (library barrel) and componentSrcMap for config.json.
// Scope: every src/components/ui/*.tsx plus presentational app components that need no router/query/server context.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const EXTRA = ['amount', 'balance-bar', 'member-avatar', 'brand-logo', 'empty-state', 'settings-section', 'code-block', 'google-icon'];
const files = [
  ...readdirSync('src/components/ui').filter((f) => f.endsWith('.tsx')).map((f) => `ui/${f}`),
  ...EXTRA.map((f) => `${f}.tsx`),
];
const lines = []; const map = {};
for (const f of files) {
  const src = readFileSync(`src/components/${f}`, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const p of m[1].split(',')) {
    const n = p.trim().split(/\s+as\s+/).pop().trim(); if (/^[A-Z][A-Za-z0-9]*$/.test(n)) names.add(n);
  }
  if (!names.size) continue;
  lines.push(`export { ${[...names].sort().join(', ')} } from "../src/components/${f.replace(/\.tsx$/, '')}";`);
  for (const n of names) map[n] = `src/components/${f}`;
}
writeFileSync('.design-sync/entry.ts', lines.join('\n') + '\n');
writeFileSync('.design-sync/.cache/srcmap.json', JSON.stringify(map, null, 1));
console.log(Object.keys(map).length, 'components from', lines.length, 'files');
