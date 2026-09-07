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

// 鬥陣：設定句為「（我方）場地變成[ＥＸ]？{地區}鬥陣（{類別}）」，見於招式、被動與石盤 tile。
// 與天氣／場地／領域互不撞名（鬥陣名以「鬥陣（…）」結尾）。條件句用「為Ｘ鬥陣」「延長Ｘ鬥陣」，
// 沒有「變成…鬥陣（類別）」，故不會誤抓；「任一鬥陣」「任一地區鬥陣」也不在地區清單內。
const FORMATION_REGIONS = ['關都', '城都', '豐緣', '神奧', '合眾', '卡洛斯', '阿羅拉', '伽勒爾', '帕底亞', '帕希歐'];
const FORMATION_CATEGORY_ORDER = ['物理', '特殊', '物理／特殊', '防禦'];
const FORMATION_PATTERN = new RegExp(
  `場地變成(ＥＸ)?(${FORMATION_REGIONS.join('|')})鬥陣（(物理／特殊|物理|特殊|防禦)）`,
  'g',
);
const FORMATION_ORDER = new Map(
  FORMATION_REGIONS.flatMap((region, regionIndex) =>
    FORMATION_CATEGORY_ORDER.map((category, categoryIndex) => [`${region}:${category}`, regionIndex * 10 + categoryIndex])),
);

// 石盤 tile：json = [[id, '名稱', '說明', 型態, 能量, 石盤等級(lv), 顏色, x, y, []], ...]。
// 只取到第 6 欄（lv），尾端的 [] 與後續欄位不需解析。
const TILE_PATTERN = /\[\d{8,12}\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*[^,\]]*,\s*[^,\]]*,\s*(\d+)/g;

function unescapeTileText(value) {
  return value.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

// 把 HTML 拆成「一般頁面（招式／被動表格）」與「石盤 tile 描述」，以便判斷場效／鬥陣是否
// 只能靠開石盤取得。
function splitBaseAndGrid(html) {
  const gridText = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join('\n');
  const baseText = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  return { baseText, gridText };
}

function gridTiles(gridText) {
  const tiles = [];
  let match;
  TILE_PATTERN.lastIndex = 0;
  while ((match = TILE_PATTERN.exec(gridText))) {
    tiles.push({ lv: Number(match[2]), desc: unescapeTileText(match[1]) });
  }
  return tiles;
}

// lv 為 null 代表來自招式／被動（不需石盤即可發動）；數字代表來自需該石盤等級的 tile。
// 只要有任一來源是招式／被動，gridLevel 即為 null；否則取各 tile 的最低等級。
function mergeGridEffect(map, key, payload, ex, lv) {
  const prev = map.get(key);
  if (!prev) {
    map.set(key, { ...payload, ex, gridLevel: lv == null ? null : lv });
    return;
  }
  if (ex) prev.ex = true;
  if (lv == null) prev.gridLevel = null;
  else if (prev.gridLevel != null) prev.gridLevel = Math.min(prev.gridLevel, lv);
}

function scanBattleEffects(text, lv, fields, formations) {
  for (const match of text.matchAll(FIELD_EFFECT_PATTERN)) {
    const def = FIELD_EFFECT_BY_NAME.get(match[2]);
    if (def) mergeGridEffect(fields, `${def.kind}:${def.code}`, { kind: def.kind, code: def.code }, Boolean(match[1]), lv);
  }
  for (const match of text.matchAll(FORMATION_PATTERN)) {
    mergeGridEffect(formations, `${match[2]}:${match[3]}`, { region: match[2], category: match[3] }, Boolean(match[1]), lv);
  }
}

// 一次回傳場效與鬥陣（含各自的 gridLevel）。
export function parsePairEffects(html) {
  const { baseText, gridText } = splitBaseAndGrid(html);
  const fields = new Map();
  const formations = new Map();
  scanBattleEffects(baseText, null, fields, formations);
  for (const tile of gridTiles(gridText)) scanBattleEffects(tile.desc, tile.lv, fields, formations);
  return {
    fieldEffects: [...fields.values()].sort((a, b) => FIELD_EFFECT_ORDER.get(`${a.kind}:${a.code}`) - FIELD_EFFECT_ORDER.get(`${b.kind}:${b.code}`)),
    formations: [...formations.values()].sort((a, b) => FORMATION_ORDER.get(`${a.region}:${a.category}`) - FORMATION_ORDER.get(`${b.region}:${b.category}`)),
  };
}

export function parsePairFieldEffects(html) {
  return parsePairEffects(html).fieldEffects;
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
