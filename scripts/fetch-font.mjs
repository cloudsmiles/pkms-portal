// 一次性腳本：下載 Zen Maru Gothic 三個字重（Medium 500 / Bold 700 / Black 900）
// 的原始 TTF，用 pyftsubset 依「站內實際用字」各壓成一個 woff2，輸出到
// assets/fonts/zen-maru。首次執行會在 scripts/.font-venv 建立 Python 虛擬環境
// （繼承系統 fonttools、本地裝 brotli），不污染系統 Python。
// 新增大量文案/拍組名後：npm run build && npm run fonts。需連網。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORTAL_DIR = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(PORTAL_DIR, 'assets', 'fonts', 'zen-maru');
const VENV_DIR = resolve(import.meta.dirname, '.font-venv');
const RAW_BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic';
const OFL_URL = `${RAW_BASE}/OFL.txt`;
const WEIGHTS = [
  { css: 500, file: 'ZenMaruGothic-Medium.ttf', out: 'zen-maru-500.woff2' },
  { css: 700, file: 'ZenMaruGothic-Bold.ttf', out: 'zen-maru-700.woff2' },
  { css: 900, file: 'ZenMaruGothic-Black.ttf', out: 'zen-maru-900.woff2' },
];

// 站內會進 DOM 的文字來源：UI 文案、標籤邏輯、建置後的全部拍組/活動名。
const TEXT_SOURCES = ['index.html', 'app.js', 'ui-helpers.mjs', 'data.js', 'dist/data.js'];
const used = new Set();
for (const name of TEXT_SOURCES) {
  try {
    const text = await readFile(resolve(PORTAL_DIR, name), 'utf8');
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp > 0x20 && cp !== 0x7f) used.add(ch);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
// 保險：基本拉丁、常用標點與符號、日文五十音。
const always = [
  [0x20, 0x7e], [0x3000, 0x303f], [0xff00, 0xffef], // 拉丁/標點、CJK 符號、全形
  [0x3040, 0x30ff], // 平假名、片假名
];
for (const [start, end] of always) for (let cp = start; cp <= end; cp++) used.add(String.fromCodePoint(cp));
'★☆✿→…×●✦'.split('').forEach((ch) => used.add(ch));
const glyphText = [...used].join('');
console.log(`覆蓋用字 ${used.size} 個`);

// --- 本機 venv（只裝 brotli；fonttools 由系統 site-packages 提供）---
// 優先使用裝了 fontTools 的直譯器（brew python@3.12 的 pyftsubset），否則退回 python3。
const candidates = ['/usr/local/opt/python@3.12/bin/python3.12', '/opt/homebrew/opt/python@3.12/bin/python3.12', 'python3'];
const systemPython = candidates.find((c) => {
  try { execFileSync(c, ['-c', 'import fontTools'], { stdio: 'ignore' }); return true; } catch { return false; }
}) ?? 'python3';
const venvPython = process.platform === 'darwin'
  ? resolve(VENV_DIR, 'bin', 'python3')
  : resolve(VENV_DIR, 'Scripts', 'python.exe');
if (!existsSync(venvPython)) {
  console.log(`建立字體工具 venv（使用 ${systemPython}，首次執行）…`);
  execFileSync(systemPython, ['-m', 'venv', '--system-site-packages', VENV_DIR], { stdio: 'inherit' });
  execFileSync(venvPython, ['-m', 'pip', 'install', '--quiet', 'brotli'], { stdio: 'inherit' });
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
const tmp = await mkdtemp();
const glyphFile = resolve(tmp, 'glyphs.txt');
await writeFile(glyphFile, glyphText, 'utf8');

for (const weight of WEIGHTS) {
  const ttf = resolve(tmp, weight.file);
  console.log(`下載 ${weight.file}…`);
  await download(`${RAW_BASE}/${weight.file}`, ttf);
  const out = resolve(OUT_DIR, weight.out);
  execFileSync(venvPython, ['-m', 'fontTools.subset', ttf,
    `--text-file=${glyphFile}`,
    '--flavor=woff2',
    '--layout-features=*',
    '--name-IDs=*',
    '--notdef-outline',
    `--output-file=${out}`,
  ], { stdio: 'inherit' });
}

const oflResponse = await fetch(OFL_URL);
if (!oflResponse.ok) throw new Error('OFL 下載失敗');
await writeFile(resolve(OUT_DIR, 'OFL.txt'), await oflResponse.text(), 'utf8');

const css = `/* 由 scripts/fetch-font.mjs 自動產生，請勿手動編輯。
   只含站內用字切片；新增大量罕用字後重跑 npm run build && npm run fonts。 */
${WEIGHTS.map((w) => `@font-face {
  font-family: 'Zen Maru Gothic';
  font-style: normal;
  font-weight: ${w.css};
  font-display: swap;
  src: url('./${w.out}') format('woff2');
}`).join('\n')}
`;
await writeFile(resolve(OUT_DIR, 'zen-maru.css'), css, 'utf8');
console.log(`完成 → ${OUT_DIR}`);

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下載失敗 ${url}：${response.status}`);
  await writeFile(dest, Buffer.from(await response.arrayBuffer()));
}

async function mkdtemp() {
  const { mkdir: makeDir } = await import('node:fs/promises');
  const dir = join(tmpdir(), `font-fetch-${process.pid}`);
  await makeDir(dir, { recursive: true });
  return dir;
}
