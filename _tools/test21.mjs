/* test21：v1.20 全新应用图标
   静态检查：PWA 图标尺寸、Android 5 档 mipmap、432×432 自适应前景、adaptive-icon 资源、
   版本一致性（manifest 19/1.20、sw v28、me 页脚 v1.24）、README v1.20 段落。
   用法：node _tools/test21.mjs <ROOT> <OUT>   （纯静态，不需要 Edge） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[3] || path.join(ROOT, '_shots');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: Boolean(ok), detail }); }
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

function pngInfo(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const sig = buf.toString('hex', 0, 8);
  if (sig !== '89504e470d0a1a0a') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], bytes: buf.length };
}

// 1) PWA PNG
const pwa = [['icon-512.png',512],['icon-192.png',192],['icon-180.png',180]].map(([f,s]) => [f, pngInfo(f), s]);
check('PWA PNG 尺寸 512/192/180', pwa.every(([f,i,s]) => i && i.w === s && i.h === s && i.bytes > 1000), pwa);

// 2) SVG 图标为同款课本 + 对勾
const svg = read('icon.svg');
check('icon.svg 渐变 + 课本 + 对勾',
  svg.includes('viewBox="0 0 512 512"') && svg.includes('linearGradient')
    && svg.includes('#4f6df5') && svg.includes('#7d5cff')
    && svg.includes('M116 218') && svg.includes('M396 218') && svg.includes('M196 132'), true);

// 3) Android 传统 mipmap
const mipmaps = [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]
  .map(([d,s]) => ['android/res/mipmap-' + d + '/ic_launcher.png', pngInfo('android/res/mipmap-' + d + '/ic_launcher.png'), s]);
check('Android 5 档传统 mipmap', mipmaps.every(([f,i,s]) => i && i.w === s && i.h === s), mipmaps);

// 4) 自适应前景 432 + 透明通道
const fg = pngInfo('android/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
check('自适应前景 432×432 透明底', fg && fg.w === 432 && fg.h === 432 && (fg.colorType === 6 || fg.colorType === 4), fg);

// 5) adaptive icon 资源与渐变背景
const adaptive = read('android/res/mipmap-anydpi-v26/ic_launcher.xml');
const bg = read('android/res/drawable/ic_launcher_background.xml');
const colors = read('android/res/values/colors.xml');
check('adaptive-icon 引用渐变背景 + 前景',
  adaptive.includes('<adaptive-icon') && adaptive.includes('@drawable/ic_launcher_background')
    && adaptive.includes('@mipmap/ic_launcher_foreground')
    && bg.includes('gradient') && bg.includes('@color/brand_start') && bg.includes('@color/brand_end')
    && colors.includes('#FF4F6DF5') && colors.includes('#FF7D5CFF'), true);

// 6) manifest 版本与 launcher 图标
const manifest = read('android/AndroidManifest.xml');
check('manifest 19/1.20 + @mipmap/ic_launcher',
  manifest.includes('android:versionCode="35"') && manifest.includes('android:versionName="1.35"')
    && manifest.includes('android:icon="@mipmap/ic_launcher"')
    && manifest.includes('android:roundIcon="@mipmap/ic_launcher"'), true);

// 7) sw 版本 + 预载图标
const sw = read('sw.js');
const me = read('js/views/me.js');
check('sw v28 预载三个图标 / 页脚 v1.24',
  sw.includes("const CACHE = 'study-tracker-v41';")
    && sw.includes("./icon.svg") && sw.includes("./icon-180.png")
    && sw.includes("./icon-192.png") && sw.includes("./icon-512.png")
    && me.includes('学习记录 v1.35'), true);

// 8) README v1.20
const readme = read('README.md');
check('README v1.20 段与 versionCode 19',
  /^### v1\.20$/m.test(readme) && readme.includes('versionCode 19') && readme.includes('全新应用图标'), true);

fs.writeFileSync(path.join(OUT, 'result21.json'), JSON.stringify({ results }, null, 2));
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? '\nFAIL ' + bad.length + '/' + results.length : '\nOK ' + results.length + '/' + results.length);
process.exit(bad.length ? 1 : 0);
