import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parseEventRecords } from './parse-data.mjs';
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

export function injectDetailAssets(html) {
  const withViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html) ? html : html.replace('</head>', '  <meta name="viewport" content="width=device-width, initial-scale=1">\n</head>');
  const withStyle = withViewport.includes('detail-style.css') ? withViewport : withViewport.replace('</head>', '  <link rel="stylesheet" href="./detail-style.css">\n</head>');
  return withStyle.includes('detail-ui.js') ? withStyle : withStyle.replace('</head>', '  <script src="./detail-ui.js" defer></script>\n</head>');
}

async function copySource(sourceDir, distDir) {
  await cp(sourceDir, resolve(distDir, 'sync-grid'), { recursive: true, filter: (source) => !source.split('/').includes('.git') });
  const targetGrids = resolve(distDir, 'sync-grid', 'grids');
  await cp(resolve(portalDir, 'overrides', 'detail-style.css'), resolve(targetGrids, 'detail-style.css'));
  await cp(resolve(portalDir, 'overrides', 'detail-ui.js'), resolve(targetGrids, 'detail-ui.js'));
  for (const name of await readdir(targetGrids)) {
    if (!name.endsWith('.html')) continue;
    const file = resolve(targetGrids, name);
    await writeFile(file, injectDetailAssets(await readFile(file, 'utf8')), 'utf8');
  }
}

export async function build() {
  const projectDir = getProjectDir({ portalDir });
  const distDir = resolve(portalDir, 'dist');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await Promise.all(staticFiles.map((name) => cp(resolve(portalDir, name), resolve(distDir, name))));
  await copySource(projectDir, distDir);

  const iconNames = await readdir(resolve(projectDir, 'icons'));
  const exIcons = new Map(iconNames.filter((name) => name.startsWith('★6ex_')).map((name) => [name.replace(/^★6ex_/, '').replace(/\.png$/i, '').normalize('NFKC'), name]));
  const [readme, eventlog, rankMap] = await Promise.all([readFile(resolve(projectDir, 'README.md'), 'utf8'), readFile(resolve(projectDir, 'eventlog.html'), 'utf8'), loadRankMap()]);
  const pairs = parsePairRecords(readme);
  const enrichedPairs = await Promise.all(pairs.map(async (pair) => {
    const rank = rankMap.get(pair.name.normalize('NFKC')) ?? null;
    try {
      const grid = await readFile(resolve(projectDir, pair.href.replace(/^\.\//, '')), 'utf8');
      const exImageName = exIcons.get(pair.name.normalize('NFKC'));
      return { ...pair, rank, attributes: parsePairAttributes(grid), role: parsePairRole(grid), limitedTag: parsePairLimitedTag(grid), exImage: exImageName ? `./icons/${exImageName}` : '', baseTotal: parsePairBaseTotal(grid) };
    } catch {
      return { ...pair, rank, attributes: [], role: '', limitedTag: '', exImage: '', baseTotal: 0 };
    }
  }));
  enrichedPairs.sort((left, right) => right.baseTotal - left.baseTotal || left.name.localeCompare(right.name));
  const data = { pairs: enrichedPairs, events: parseEventRecords(eventlog) };
  await writeFile(resolve(distDir, 'data.js'), `window.SYNC_GRID_DATA = ${JSON.stringify(data)};\n`, 'utf8');
  const ranked = enrichedPairs.filter((pair) => pair.rank != null).length;
  console.log(`已生成 dist：${data.pairs.length} 個拍組（含田雞榜等級 ${ranked}）、${data.events.length} 個活動`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
