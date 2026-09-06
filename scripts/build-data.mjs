import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parsePairFieldEffects, parseEventRecords } from './parse-data.mjs';
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

// 快取破壞：detail 資源引用附加 ?v=<內容雜湊>，詳頁樣式/腳本更新後瀏覽器不會吃到舊快取。
export function injectDetailAssets(html, versions = {}) {
  const styleQuery = versions.style ? `?v=${versions.style}` : '';
  const uiQuery = versions.ui ? `?v=${versions.ui}` : '';
  const withViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html) ? html : html.replace('</head>', '  <meta name="viewport" content="width=device-width, initial-scale=1">\n</head>');
  const withStyle = withViewport.includes('detail-style.css') ? withViewport : withViewport.replace('</head>', `  <link rel="stylesheet" href="./detail-style.css${styleQuery}">\n</head>`);
  return withStyle.includes('detail-ui.js') ? withStyle : withStyle.replace('</head>', `  <script src="./detail-ui.js${uiQuery}" defer></script>\n</head>`);
}

async function copySource(sourceDir, distDir, detailVersions) {
  await cp(sourceDir, resolve(distDir, 'sync-grid'), { recursive: true, filter: (source) => !source.split('/').includes('.git') });
  const targetGrids = resolve(distDir, 'sync-grid', 'grids');
  await cp(resolve(portalDir, 'overrides', 'detail-style.css'), resolve(targetGrids, 'detail-style.css'));
  await cp(resolve(portalDir, 'overrides', 'detail-ui.js'), resolve(targetGrids, 'detail-ui.js'));
  for (const name of await readdir(targetGrids)) {
    if (!name.endsWith('.html')) continue;
    const file = resolve(targetGrids, name);
    await writeFile(file, injectDetailAssets(await readFile(file, 'utf8'), detailVersions), 'utf8');
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
  const [detailStyle, detailUi] = await Promise.all([
    readFile(resolve(portalDir, 'overrides', 'detail-style.css'), 'utf8'),
    readFile(resolve(portalDir, 'overrides', 'detail-ui.js'), 'utf8'),
  ]);
  await copySource(projectDir, distDir, { style: versionOf(detailStyle), ui: versionOf(detailUi) });

  const iconNames = await readdir(resolve(projectDir, 'icons'));
  const exIcons = new Map(iconNames.filter((name) => name.startsWith('★6ex_')).map((name) => [name.replace(/^★6ex_/, '').replace(/\.png$/i, '').normalize('NFKC'), name]));
  const [readme, eventlog, rankMap] = await Promise.all([readFile(resolve(projectDir, 'README.md'), 'utf8'), readFile(resolve(projectDir, 'eventlog.html'), 'utf8'), loadRankMap()]);
  const pairs = parsePairRecords(readme);
  const enrichedPairs = await Promise.all(pairs.map(async (pair) => {
    const rank = rankMap.get(pair.name.normalize('NFKC')) ?? null;
    try {
      const grid = await readFile(resolve(projectDir, pair.href.replace(/^\.\//, '')), 'utf8');
      const exImageName = exIcons.get(pair.name.normalize('NFKC'));
      return { ...pair, rank, attributes: parsePairAttributes(grid), role: parsePairRole(grid), limitedTag: parsePairLimitedTag(grid), fieldEffects: parsePairFieldEffects(grid), exImage: exImageName ? `./icons/${exImageName}` : '', baseTotal: parsePairBaseTotal(grid) };
    } catch {
      return { ...pair, rank, attributes: [], role: '', limitedTag: '', fieldEffects: [], exImage: '', baseTotal: 0 };
    }
  }));
  enrichedPairs.sort((left, right) => right.baseTotal - left.baseTotal || left.name.localeCompare(right.name));
  const data = { pairs: enrichedPairs, events: parseEventRecords(eventlog) };
  await writeFile(resolve(distDir, 'data.js'), `window.SYNC_GRID_DATA = ${JSON.stringify(data)};\n`, 'utf8');
  await bustAssetCache(distDir);
  const ranked = enrichedPairs.filter((pair) => pair.rank != null).length;
  console.log(`已生成 dist：${data.pairs.length} 個拍組（含田雞榜等級 ${ranked}）、${data.events.length} 個活動`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
