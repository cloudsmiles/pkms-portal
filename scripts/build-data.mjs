import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parseEventRecords } from './parse-data.mjs';
import { getProjectDir } from './project-path.mjs';

const portalDir = resolve(import.meta.dirname, '..');
const staticFiles = ['index.html', 'styles.css', 'app.js', 'ui-helpers.mjs', 'web-path.mjs'];

export function injectDetailAssets(html) {
  const withStyle = html.includes('detail-style.css') ? html : html.replace('</head>', '  <link rel="stylesheet" href="./detail-style.css">\n</head>');
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
  const [readme, eventlog] = await Promise.all([readFile(resolve(projectDir, 'README.md'), 'utf8'), readFile(resolve(projectDir, 'eventlog.html'), 'utf8')]);
  const pairs = parsePairRecords(readme);
  const enrichedPairs = await Promise.all(pairs.map(async (pair) => {
    try {
      const grid = await readFile(resolve(projectDir, pair.href.replace(/^\.\//, '')), 'utf8');
      const exImageName = exIcons.get(pair.name.normalize('NFKC'));
      return { ...pair, attributes: parsePairAttributes(grid), role: parsePairRole(grid), limitedTag: parsePairLimitedTag(grid), exImage: exImageName ? `./icons/${exImageName}` : '', baseTotal: parsePairBaseTotal(grid) };
    } catch {
      return { ...pair, attributes: [], role: '', limitedTag: '', exImage: '', baseTotal: 0 };
    }
  }));
  enrichedPairs.sort((left, right) => right.baseTotal - left.baseTotal || left.name.localeCompare(right.name));
  const data = { pairs: enrichedPairs, events: parseEventRecords(eventlog) };
  await writeFile(resolve(distDir, 'data.js'), `window.SYNC_GRID_DATA = ${JSON.stringify(data)};\n`, 'utf8');
  console.log(`已生成 dist：${data.pairs.length} 個拍組、${data.events.length} 個活動`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
