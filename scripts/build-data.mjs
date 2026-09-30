import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parsePairEffects, parsePairForms, parseEventRecords } from './parse-data.mjs';
import { getProjectDir } from './project-path.mjs';

const portalDir = resolve(import.meta.dirname, '..');
const staticFiles = ['index.html', 'styles.css', 'app.js', 'ui-helpers.mjs', 'web-path.mjs'];

// 田鸡榜等級：rank/data.js 由 rank/ 管線（圖片匹配 + 列 B 等級徽章）產生，為
// `export const 拍组等级 = { 拍組名: 0~5 }`。鍵為繁中拍組名（=★6ex 圖示檔名、
// = pair.name），這裡用 NFKC 正規化後對齊。檔案不存在時視為無等級資料（全數 null）。
async function loadRankMap() {
  const rankFile = resolve(portalDir, 'rank', 'data.js');
  try {
    const mod = await import(pathToFileURL(rankFile).href);
    const table = mod['拍组等级'] ?? mod.default ?? {};
    return new Map(Object.entries(table).map(([name, rank]) => [name.normalize('NFKC'), Number(rank)]));
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    console.log('未找到 rank/data.js，略過等級資料（請先執行 rank/ 管線產生）');
    return new Map();
  }
}

// 拍組上線時間以 icons 圖示內容「首次進版」日期為代理。直接讀新增（A）記錄會被
// 兩種情況誤導：舊檔整批複製成新名字（C100，如阪木→坂木的字符修正）、同內容
// 改名（R100）。解法是比對 blob：新進檔案若與父 commit 中某舊檔 blob 相同，便
// 沿舊檔追溯到真正起源。git log 關閉改名偵測，讓目的地一律以 A 呈現；再對每個
// 相關 commit 與其父 commit 並行各取一次 ls-tree，建立 path↔blob 對照。非 git
// 環境或 log 失敗時，回傳一律解析為 null 的函式。
async function loadIconReleaseResolver(projectDir) {
  let logOutput;
  try {
    ({ stdout: logOutput } = await execFileAsync('git', ['-c', 'core.quotePath=false', 'log', '--no-renames', '--date=short', '--format=C:%H|%ad', '--name-status', '--', 'icons'], { cwd: projectDir, maxBuffer: 32 * 1024 * 1024 }));
  } catch {
    return () => null;
  }
  // addsByPath：path → [{sha, date}]；log 由新到舊，收集後反轉成由舊到新。
  const addsByPath = new Map();
  let currentCommit;
  for (const line of logOutput.split('\n')) {
    if (line.startsWith('C:')) {
      const [sha, date] = line.slice(2).split('|');
      currentCommit = { sha, date };
    } else if (currentCommit && line.startsWith('A\t')) {
      const path = line.slice(2).normalize('NFKC');
      if (!addsByPath.has(path)) addsByPath.set(path, []);
      addsByPath.get(path).push({ sha: currentCommit.sha, date: currentCommit.date });
    }
  }
  for (const records of addsByPath.values()) records.reverse();

  const wanted = new Set();
  for (const records of addsByPath.values()) {
    wanted.add(records[0].sha);
    wanted.add(`${records[0].sha}^`);
  }
  const loadTree = async (key) => {
    const byPath = new Map();
    const byBlob = new Map();
    try {
      const { stdout } = await execFileAsync('git', ['-c', 'core.quotePath=false', 'ls-tree', '-z', '-r', key, '--', 'icons'], { cwd: projectDir, maxBuffer: 32 * 1024 * 1024 });
      for (const entry of stdout.split('\0')) {
        if (!entry) continue;
        const tab = entry.indexOf('\t');
        const [, type, blob] = entry.slice(0, tab).split(' ');
        const path = entry.slice(tab + 1).normalize('NFKC');
        if (type === 'blob') {
          byPath.set(path, blob);
          if (!byBlob.has(blob)) byBlob.set(blob, path);
        }
      }
    } catch {
      // 根 commit 的父查詢等：留空樹。
    }
    return { byPath, byBlob };
  };
  const keys = [...wanted];
  const trees = new Map();
  let cursor = 0;
  const workers = [...Array(12)].map(async () => {
    while (cursor < keys.length) {
      const key = keys[cursor++];
      trees.set(key, await loadTree(key));
    }
  });
  await Promise.all(workers);

  // 傳入相對於 sync-grid 根目錄的 icons/... 路徑，回傳真正起源日期；解析不出為 null。
  return (relPath) => {
    let path = relPath.normalize('NFKC');
    for (let guard = 0; guard < 30; guard++) {
      const records = addsByPath.get(path);
      if (!records?.length) return null;
      const first = records[0];
      const blob = trees.get(first.sha)?.byPath.get(path);
      const source = blob ? trees.get(`${first.sha}^`)?.byBlob.get(blob) : null;
      if (!source || source === path) return first.date;
      path = source;
    }
    return null;
  };
}

// 取普通圖與 EX 圖中最早的起源日期（相對於 sync-grid 根目錄的 ./icons/... 路徑）。
const releaseDateOf = (resolveRelease, ...images) => images
  .map((image) => (image ? resolveRelease(image.replace(/^\.\//, '')) : ''))
  .filter(Boolean)
  .sort()[0] ?? null;

// 屬性值用的 HTML 跳脫（拍組名含 &（）等字元）。
const escapeHtmlAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 快取破壞：detail 資源引用附加 ?v=<內容雜湊>，詳頁樣式/腳本更新後瀏覽器不會吃到舊快取。
// pairName 為檔名去掉 .html（＝拍組名）：補上可分辨的分頁標題、語言與描述。
export function injectDetailAssets(html, versions = {}, pairName = '') {
  const styleQuery = versions.style ? `?v=${versions.style}` : '';
  const uiQuery = versions.ui ? `?v=${versions.ui}` : '';
  let out = html.replace(/<html(?![^>]*\blang=)([^>]*)>/i, '<html lang="zh-Hant"$1>');
  if (pairName) {
    const safeName = escapeHtmlAttr(pairName);
    const title = `${safeName} · 拍檔石盤`;
    out = /<title[^>]*>[\s\S]*?<\/title>/i.test(out)
      ? out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
      : out.replace('</head>', `  <title>${title}</title>\n</head>`);
    if (!out.includes('name="description"')) {
      out = out.replace('</head>', `  <meta name="description" content="${safeName} 的拍檔石盤、招式、被動能力與能力值資料。">\n</head>`);
    }
  }
  const withViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(out) ? out : out.replace('</head>', '  <meta name="viewport" content="width=device-width, initial-scale=1">\n</head>');
  const withStyle = withViewport.includes('detail-style.css') ? withViewport : withViewport.replace('</head>', `  <link rel="stylesheet" href="./detail-style.css${styleQuery}">\n</head>`);
  return withStyle.includes('detail-ui.js') ? withStyle : withStyle.replace('</head>', `  <script src="./detail-ui.js${uiQuery}" defer></script>\n</head>`);
}

// 只複製石盤頁面（grids 的 html + autoPanel.js）與 portal 覆蓋檔；其餘圖片由
// copyReferencedImages 依實際引用挑選，避免把整包 scouts/events 圖庫都搬進 dist。
async function copyGrids(sourceDir, distDir, detailVersions) {
  const sourceGrids = resolve(sourceDir, 'grids');
  const targetGrids = resolve(distDir, 'sync-grid', 'grids');
  await mkdir(targetGrids, { recursive: true });
  await cp(resolve(sourceGrids, 'autoPanel.js'), resolve(targetGrids, 'autoPanel.js'));
  await cp(resolve(portalDir, 'overrides', 'detail-style.css'), resolve(targetGrids, 'detail-style.css'));
  await cp(resolve(portalDir, 'overrides', 'detail-ui.js'), resolve(targetGrids, 'detail-ui.js'));
  for (const name of await readdir(sourceGrids)) {
    if (!name.endsWith('.html')) continue;
    const html = await readFile(resolve(sourceGrids, name), 'utf8');
    const pairName = name.replace(/\.html$/i, '');
    await writeFile(resolve(targetGrids, name), injectDetailAssets(html, detailVersions, pairName), 'utf8');
  }
}

// referenced 為相對於 sync-grid 根目錄的圖片路徑（./icons、./events、./scouts）。
async function copyReferencedImages(sourceDir, distDir, referenced) {
  for (const rel of referenced) {
    const clean = rel.replace(/^\.\//, '');
    const target = resolve(distDir, 'sync-grid', clean);
    await mkdir(dirname(target), { recursive: true });
    try {
      await cp(resolve(sourceDir, clean), target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

// 內容雜湊取前 10 碼：檔案沒變則 ?v= 不變（可沿用快取），一改變就自動換網址。
const versionOf = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);

async function bustAssetCache(distDir) {
  const readDist = (name) => readFile(resolve(distDir, name), 'utf8');
  const [styles, uiHelpers, webPath, dataContent] = await Promise.all(
    ['styles.css', 'ui-helpers.mjs', 'web-path.mjs', 'data.js'].map(readDist),
  );
  const versions = { styles: versionOf(styles), uiHelpers: versionOf(uiHelpers), webPath: versionOf(webPath), data: versionOf(dataContent) };

  // app.js 先改 import 網址，再用「最終內容」算雜湊，連帶相依模組變更也會換 app.js 的 ?v=。
  const appFile = resolve(distDir, 'app.js');
  const appBusted = (await readFile(appFile, 'utf8'))
    .replace("'./ui-helpers.mjs'", `'./ui-helpers.mjs?v=${versions.uiHelpers}'`)
    .replace("'./web-path.mjs'", `'./web-path.mjs?v=${versions.webPath}'`);
  await writeFile(appFile, appBusted, 'utf8');
  versions.app = versionOf(appBusted);

  const indexFile = resolve(distDir, 'index.html');
  const indexBusted = (await readFile(indexFile, 'utf8'))
    .replace('href="./styles.css"', `href="./styles.css?v=${versions.styles}"`)
    .replace('src="./data.js"', `src="./data.js?v=${versions.data}"`)
    .replace('src="./app.js"', `src="./app.js?v=${versions.app}"`);
  await writeFile(indexFile, indexBusted, 'utf8');
}

export async function build() {
  const projectDir = getProjectDir({ portalDir });
  const distDir = resolve(portalDir, 'dist');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await Promise.all(staticFiles.map((name) => cp(resolve(portalDir, name), resolve(distDir, name))));
  await cp(resolve(portalDir, 'assets'), resolve(distDir, 'assets'), { recursive: true });
  const [detailStyle, detailUi] = await Promise.all([
    readFile(resolve(portalDir, 'overrides', 'detail-style.css'), 'utf8'),
    readFile(resolve(portalDir, 'overrides', 'detail-ui.js'), 'utf8'),
  ]);
  const detailVersions = { style: versionOf(detailStyle), ui: versionOf(detailUi) };

  const iconNames = await readdir(resolve(projectDir, 'icons'));
  const exIcons = new Map(iconNames.filter((name) => name.startsWith('★6ex_')).map((name) => [name.replace(/^★6ex_/, '').replace(/\.png$/i, '').normalize('NFKC'), name]));
  const [readme, eventlog, rankMap, resolveRelease] = await Promise.all([readFile(resolve(projectDir, 'README.md'), 'utf8'), readFile(resolve(projectDir, 'eventlog.html'), 'utf8'), loadRankMap(), loadIconReleaseResolver(projectDir)]);
  const events = parseEventRecords(eventlog);
  const pairs = parsePairRecords(readme);
  const enrichedPairs = await Promise.all(pairs.map(async (pair) => {
    const rank = rankMap.get(pair.name.normalize('NFKC')) ?? null;
    try {
      const grid = await readFile(resolve(projectDir, pair.href.replace(/^\.\//, '')), 'utf8');
      const exImageName = exIcons.get(pair.name.normalize('NFKC'));
      const { fieldEffects, formations } = parsePairEffects(grid);
      const exImage = exImageName ? `./icons/${exImageName}` : '';
      return { ...pair, rank, releaseDate: releaseDateOf(resolveRelease, pair.image, exImage), attributes: parsePairAttributes(grid), role: parsePairRole(grid), limitedTag: parsePairLimitedTag(grid), fieldEffects, formations, forms: parsePairForms(grid), exImage, baseTotal: parsePairBaseTotal(grid) };
    } catch {
      return { ...pair, rank, releaseDate: releaseDateOf(resolveRelease, pair.image), attributes: [], role: '', limitedTag: '', fieldEffects: [], formations: [], forms: [], exImage: '', baseTotal: 0 };
    }
  }));
  // 預設由上線新到舊；無日期者排最後，同期再按白值高→低、名稱。
  enrichedPairs.sort((left, right) => (right.releaseDate || '').localeCompare(left.releaseDate || '') || right.baseTotal - left.baseTotal || left.name.localeCompare(right.name));
  const data = { pairs: enrichedPairs, events };
  await writeFile(resolve(distDir, 'data.js'), `window.SYNC_GRID_DATA = ${JSON.stringify(data)};\n`, 'utf8');

  await copyGrids(projectDir, distDir, detailVersions);
  const referencedImages = new Set();
  for (const pair of enrichedPairs) {
    if (pair.image) referencedImages.add(pair.image);
    if (pair.exImage) referencedImages.add(pair.exImage);
  }
  for (const event of events) {
    if (event.image) referencedImages.add(event.image);
  }
  await copyReferencedImages(projectDir, distDir, referencedImages);
  await bustAssetCache(distDir);
  const ranked = enrichedPairs.filter((pair) => pair.rank != null).length;
  console.log(`已生成 dist：${data.pairs.length} 個拍組（含田雞榜等級 ${ranked}）、${data.events.length} 個活動`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
