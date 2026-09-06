const pairLinkPattern = /<a\s+href="([^"]*\/grids\/[^\"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const imagePattern = /<img\s+[^>]*src="([^"]+)"[^>]*>/i;
const eventDatePattern = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})\s+-\s+(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})/;

function stripTags(value) {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
}

function isoDate(year, month, day, time) {
  return `${year}-${month}-${day}T${time}:00`;
}

export function parsePairAttributes(html) {
  const attributes = '一般|火|水|電|草|冰|格鬥|毒|地面|飛行|超能力|蟲|岩石|幽靈|龍|惡|鋼|妖精';
  const teamTables = [...html.matchAll(/<table[^>]*class="[^"]*\bteam\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  return [...new Set(teamTables.flatMap((table) => [...table[1].matchAll(new RegExp(`(${attributes})屬性`, 'g'))].map((match) => match[1])))];
}

export function parsePairRole(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const headerIndex = rows.findIndex((row) => stripTags(row[1]).includes('體系'));
  if (headerIndex < 0 || !rows[headerIndex + 1]) return '';
  const cells = [...rows[headerIndex + 1][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
  const roles = ['特殊攻擊型', '物理攻擊型'];
  const systems = cells.slice(0, 2).map((cell) => stripTags(cell[1]).replace(/\s+/g, ''));
  const explicitRole = roles.find((role) => systems.some((system) => system.includes(role)));
  if (explicitRole) return explicitRole;

  const moveTables = [...html.matchAll(/<table[^>]*class="[^"]*\bmove\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  const moveCategories = new Set(moveTables.flatMap((table) => [...table[1].matchAll(/<tr[^>]*>\s*<td[^>]*>\s*分類\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]).replace(/\s+/g, ''))));
  if (moveCategories.has('物理') && moveCategories.has('特殊')) return '雙攻型';
  if (moveCategories.has('物理')) return '物理攻擊型';
  if (moveCategories.has('特殊')) return '特殊攻擊型';
  return '';
}

// 場效（天氣／場地／領域）：設定句固定為「將天氣|場地|領域變成[ＥＸ]Ｘ」，招式、被動、
// 石盤 tile 描述都用此句式。名稱後必須緊跟句讀/標籤終止字元，條件句（「變成日照強烈時」
// 「當領域為Ｘ時」「延長Ｘ領域的持續時間」）便不會誤抓。
const FIELD_EFFECT_DEFS = [
  { kind: 'weather', code: 'sun', names: ['日照強烈的狀態', '日照強烈'] },
  { kind: 'weather', code: 'rain', names: ['下雨'] },
  { kind: 'weather', code: 'sand', names: ['沙暴'] },
  { kind: 'weather', code: 'hail', names: ['冰雹'] },
  { kind: 'terrain', code: 'electric', names: ['電氣場地'] },
  { kind: 'terrain', code: 'grassy', names: ['青草場地'] },
  { kind: 'terrain', code: 'psychic', names: ['精神場地'] },
  { kind: 'zone', code: '一般', names: ['淨空領域'] },
  { kind: 'zone', code: '冰', names: ['冰柱領域'] },
  { kind: 'zone', code: '格鬥', names: ['拳頭領域'] },
  { kind: 'zone', code: '毒', names: ['劇毒領域'] },
  { kind: 'zone', code: '地面', names: ['大地領域'] },
  { kind: 'zone', code: '飛行', names: ['藍天領域'] },
  { kind: 'zone', code: '蟲', names: ['玉蟲領域'] },
  { kind: 'zone', code: '岩石', names: ['岩石領域'] },
  { kind: 'zone', code: '幽靈', names: ['妖怪領域'] },
  { kind: 'zone', code: '龍', names: ['龍之領域'] },
  { kind: 'zone', code: '惡', names: ['惡顏領域'] },
  { kind: 'zone', code: '鋼', names: ['鋼鐵領域'] },
  { kind: 'zone', code: '妖精', names: ['妖精領域'] },
];

const FIELD_EFFECT_BY_NAME = new Map(FIELD_EFFECT_DEFS.flatMap((def) => def.names.map((name) => [name, def])));
const FIELD_EFFECT_PATTERN = new RegExp(
  `將(?:天氣|場地|領域)變成(ＥＸ)?(${FIELD_EFFECT_DEFS.flatMap((def) => def.names).sort((a, b) => b.length - a.length).join('|')})(?=[。<\\n'"]|$)`,
  'g',
);
const FIELD_EFFECT_ORDER = new Map(FIELD_EFFECT_DEFS.map((def, index) => [`${def.kind}:${def.code}`, index]));

export function parsePairFieldEffects(html) {
  const found = new Map();
  for (const match of html.matchAll(FIELD_EFFECT_PATTERN)) {
    const def = FIELD_EFFECT_BY_NAME.get(match[2]);
    if (!def) continue;
    const key = `${def.kind}:${def.code}`;
    found.set(key, { kind: def.kind, code: def.code, ex: Boolean(match[1]) || (found.get(key)?.ex ?? false) });
  }
  return [...found.values()].sort((a, b) => FIELD_EFFECT_ORDER.get(`${a.kind}:${a.code}`) - FIELD_EFFECT_ORDER.get(`${b.kind}:${b.code}`));
}

export function parsePairLimitedTag(html) {
  const title = html.match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1];
  const plainTitle = title ? stripTags(title).replace(/\s+/g, ' ') : '';
  return plainTitle.match(/^(.+?限定)(?=★\d)/)?.[1] ?? '';
}

export function parsePairBaseTotal(html) {
  const statNames = new Set(['ＨＰ', 'HP', '攻擊', '防禦', '特攻', '特防', '速度']);
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) => stripTags(cell[1]).replace(/\s+/g, '')));
    const levelRow = rows.find((row) => row.includes('Lv.'));
    const levelIndex = levelRow?.indexOf('200');
    if (levelIndex === undefined || levelIndex < 0) continue;
    const values = rows.filter((row) => statNames.has(row[0])).map((row) => Number(row[levelIndex])).filter(Number.isFinite);
    if (values.length === 6) return values.reduce((total, value) => total + value, 0);
  }
  return 0;
}

export function parsePairRecords(markdown) {
  const records = [];
  const allowedCategories = new Set(['攻擊型', '技術型', '輔助型', '速戰型', '場地型', '複合型']);
  const seenLinks = new Set();
  const headings = [...markdown.matchAll(/^###\s+(.+)$/gm)].map((match) => ({ index: match.index, category: match[1].trim() }));
  let match;
  while ((match = pairLinkPattern.exec(markdown))) {
    const heading = headings.filter((item) => item.index < match.index).at(-1);
    if (!heading || !allowedCategories.has(heading.category) || seenLinks.has(match[1])) continue;
    seenLinks.add(match[1]);
    const content = match[2];
    const image = content.match(imagePattern)?.[1] ?? '';
    const name = stripTags(content).replace(/\s+/g, ' ');
    records.push({ category: heading.category, name, href: match[1], image });
  }
  return records;
}

export function parseEventRecords(html) {
  return [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].flatMap((match) => {
    const block = match[1];
    const date = block.match(eventDatePattern);
    if (!date) return [];
    const image = block.match(imagePattern)?.[1] ?? '';
    const text = stripTags(block).split('\n').map((line) => line.trim()).filter(Boolean);
    const title = text[1] ?? '未命名活動';
    return [{
      start: isoDate(date[1], date[2], date[3], date[4]),
      end: isoDate(date[5], date[6], date[7], date[8]),
      title,
      description: text.slice(2).join(' '),
      image
    }];
  });
}

export function getEventStatus(event, now = new Date()) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'active';
}
