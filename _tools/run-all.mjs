/* run-all：一条命令跑完 28 个测试套件
   用法：node _tools/run-all.mjs [ROOT] [OUT] [EDGE]
     ROOT 默认项目根，OUT 默认 <ROOT>/_shots，EDGE 默认自动探测（或环境变量 ST_EDGE）
   做三件事：
     1) 用【绝对路径】ROOT 起静态服务器（8123）——test2~test20 依赖外部服务器，
        传相对路径会被 server.mjs 的目录越界守卫判成 403；
     2) 串行跑 test.mjs → test2 ~ test28，各自独立 OUT 子目录与调试端口，
        避免 DBG 端口 / user-data-dir 撞车（不要并行跑，只能串行）；
     3) 汇总每个套件的 通过/总数，任一失败则退出码 1。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(process.argv[2] || PROJECT);
const OUT = path.resolve(process.argv[3] || path.join(ROOT, '_shots'));
const EDGE_ARG = process.argv[4] || process.env.ST_EDGE || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u) => new Promise((res, rej) => {
  http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d)); }).on('error', rej);
});

function detectEdge() {
  const list = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/microsoft-edge',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  const hit = list.find((p) => fs.existsSync(p));
  if (!hit) {
    console.error('找不到 Edge，请把 msedge 路径作为第 3 个参数传入，或设置 ST_EDGE。');
    process.exit(1);
  }
  return hit;
}

const EDGE = EDGE_ARG || detectEdge();
if (!fs.existsSync(EDGE)) { console.error('Edge 不存在：' + EDGE); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const SUITES = [
  { file: 'test.mjs', dir: 't1', port: 8123, dbg: 9333, result: 'result.json' },
  { file: 'test2.mjs', dir: 't2', port: 8123, dbg: 9336, result: 'result2.json' },
  { file: 'test3.mjs', dir: 't3', port: 8123, dbg: 9338, result: 'result3.json' },
  { file: 'test4.mjs', dir: 't4', port: 8123, dbg: 9339, result: 'result4.json' },
  { file: 'test5.mjs', dir: 't5', port: 8123, dbg: 9341, result: 'result5.json' },
  { file: 'test6.mjs', dir: 't6', port: 8126, dbg: 9356, result: 'result6.json' },
  { file: 'test7.mjs', dir: 't7', port: 8127, dbg: 9360, result: 'result7.json' },
  { file: 'test8.mjs', dir: 't8', port: 8128, dbg: 9362, result: 'result8.json' },
  { file: 'test9.mjs', dir: 't9', port: 8129, dbg: 9364, result: 'result9.json' },
  { file: 'test10.mjs', dir: 't10', port: 8130, dbg: 9366, result: 'result10.json' },
  { file: 'test11.mjs', dir: 't11', port: 8131, dbg: 9368, result: 'result11.json' },
  { file: 'test12.mjs', dir: 't12', port: 8132, dbg: 9372, result: 'result12.json' },
  { file: 'test13.mjs', dir: 't13', port: 8133, dbg: 9374, result: 'result13.json' },
  { file: 'test14.mjs', dir: 't14', port: 8134, dbg: 9375, result: 'result14.json' },
  { file: 'test15.mjs', dir: 't15', port: 8135, dbg: 9376, result: 'result15.json' },
  { file: 'test16.mjs', dir: 't16', port: 8136, dbg: 9377, result: 'result16.json' },
  { file: 'test17.mjs', dir: 't17', port: 8137, dbg: 9378, result: 'result17.json' },
  { file: 'test18.mjs', dir: 't18', port: 8138, dbg: 9379, result: 'result18.json' },
  { file: 'test19.mjs', dir: 't19', port: 8139, dbg: 9380, result: 'result19.json' },
  { file: 'test20.mjs', dir: 't20', port: 8140, dbg: 9381, result: 'result20.json' },
  { file: 'test21.mjs', dir: 't21', port: 8141, dbg: 9382, result: 'result21.json' },
  { file: 'test22.mjs', dir: 't22', port: 8142, dbg: 9383, result: 'result22.json' },
  { file: 'test23.mjs', dir: 't23', port: 8143, dbg: 9384, result: 'result23.json' },
  { file: 'test24.mjs', dir: 't24', port: 8144, dbg: 9385, result: 'result24.json' },
  { file: 'test25.mjs', dir: 't25', port: 8145, dbg: 9386, result: 'result25.json' },
  { file: 'test26.mjs', dir: 't26', port: 8146, dbg: 9387, result: 'result26.json' },
  { file: 'test27.mjs', dir: 't27', port: 8147, dbg: 9388, result: 'result27.json' },
  { file: 'test28.mjs', dir: 't28', port: 8148, dbg: 9389, result: 'result28.json' },
];

console.log('ROOT =', ROOT);
console.log('OUT  =', OUT);
console.log('EDGE =', EDGE);

/* ---------- 静态服务器（绝对路径 ROOT） ---------- */
const server = spawn(process.execPath, [path.join(HERE, 'server.mjs'), ROOT, '8123'], { stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch (_) {} };
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('exit', stop);

let up = false;
for (let i = 0; i < 60; i += 1) {
  try {
    const body = await get('http://127.0.0.1:8123/index.html');
    if (body.includes('<html') || body.includes('<!DOCTYPE')) { up = true; break; }
  } catch (_) {}
  await sleep(150);
}
if (!up) { console.error('静态服务器没起来（8123）。'); stop(); process.exit(1); }

/* ---------- 串行跑套件 ---------- */
function runSuite(s) {
  const out = path.join(OUT, s.dir);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(HERE, s.file);
  console.log('\n=== ' + s.file + ' -> ' + out + ' ===');
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file, ROOT, out, EDGE], {
      stdio: 'inherit',
      env: { ...process.env, ST_PORT: String(s.port), ST_DBG: String(s.dbg) },
    });
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, 300000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ...s, out, code, ms: Date.now() - t0 });
    });
  });
}

const rows = [];
for (const s of SUITES) rows.push(await runSuite(s));
stop();

/* ---------- 汇总 ---------- */
let total = 0;
let passed = 0;
let failedSuites = 0;
console.log('\n===== 汇总 =====');
for (const r of rows) {
  let n = 0;
  let ok = 0;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(r.out, r.result), 'utf8'));
    const list = Array.isArray(data) ? data : data.results || [];
    n = list.length;
    ok = list.filter((x) => x.ok).length;
  } catch (_) {}
  total += n;
  passed += ok;
  const bad = r.code !== 0 || ok !== n;
  if (bad) failedSuites += 1;
  console.log(
    (bad ? 'FAIL ' : 'ok   ') +
    r.file.padEnd(11) +
    String(ok).padStart(3) + '/' + String(n).padEnd(3) +
    '  exit=' + r.code +
    '  ' + Math.round(r.ms / 1000) + 's'
  );
}
console.log('\n合计 ' + passed + '/' + total + ' 通过，套件 ' + (rows.length - failedSuites) + '/' + rows.length);
process.exit(failedSuites || passed !== total ? 1 : 0);
