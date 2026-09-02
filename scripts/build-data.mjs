import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parseEventRecords } from './parse-data.mjs';
import { getProjectDir } from './project-path.mjs';

const portalDir = resolve(import.meta.dirname, '..');
const projectDir = getProjectDir({ portalDir });
const iconDir = resolve(projectDir, 'icons');
const iconNames = await readdir(iconDir);
const exIcons = new Map(iconNames.filter((name) => name.startsWith('★6ex_')).map((name) => [name.replace(/^★6ex_/, '').replace(/\.png$/i, '').normalize('NFKC'), name]));
const [readme, eventlog] = await Promise.all([
  readFile(resolve(projectDir, 'README.md'), 'utf8'),
  readFile(resolve(projectDir, 'eventlog.html'), 'utf8')
]);
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
await writeFile(resolve(portalDir, 'data.js'), `window.SYNC_GRID_DATA = ${JSON.stringify(data)};\n`, 'utf8');
console.log(`已生成 ${data.pairs.length} 個拍組、${data.events.length} 個活動`);
