import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.argv[2];
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '_shots' || e.name === '_tools') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(ROOT);
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /import\s*\{([^}]*)\}\s*from/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    const body = src.slice(m.index + m[0].length);
    for (const n of names) {
      const use = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      const rest = src.slice(0, m.index) + body;
      if (!use.test(rest)) bad.push(path.relative(ROOT, f) + ' -> ' + n);
    }
  }
}
console.log(bad.length ? bad.join('\n') : '(no unused imports)');
