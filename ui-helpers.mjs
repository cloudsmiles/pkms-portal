export function getPageItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis-right', totalPages];
  if (currentPage >= totalPages - 2) return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export function getViewFilters(tab) {
  return tab === 'pairs' ? ['category', 'attribute', 'role', 'rank', 'fieldEffect', 'formation'] : ['date', 'status'];
}

// 田雞榜等級：1~15 的梯子。四個球級（新手/精靈球/超級球/高級球）各分 1<2<3 三檔，
// 球級之間「高級球1」高於「超級球3」；大師球(13)、冠軍(14)無子級，自由者(15)為最高、
// 彩色漸層。值越大越強。
const RANK_BALL_NAMES = ['新手', '精靈球', '超級球', '高級球'];

export function rankFamily(rank) {
  if (rank === 15) return 'free';
  if (rank === 14) return 'champion';
  if (rank === 13) return 'master';
  return ['novice', 'poke', 'super', 'hyper'][Math.floor((rank - 1) / 3)] ?? 'novice';
}

function rankLevelLabel(value) {
  if (value === 15) return '自由者';
  if (value === 14) return '冠軍';
  if (value === 13) return '大師球';
  const tier = Math.floor((value - 1) / 3);
  const sub = ((value - 1) % 3) + 1;
  return `${RANK_BALL_NAMES[tier]}${sub}`;
}

// 由高到低，供篩選下拉使用。
export const rankLevels = Array.from({ length: 15 }, (_, i) => 15 - i)
  .map((value) => ({ value, label: rankLevelLabel(value), family: rankFamily(value) }));

export function getRankTierLabel(rank) {
  return rankLevels.find((tier) => tier.value === rank)?.label ?? '';
}

export function getPairCategories(pairs) {
  const combatTypes = new Set(['攻擊型', '技術型', '輔助型', '速戰型', '場地型', '複合型']);
  return [...new Set(pairs.map((pair) => pair.category).filter((category) => combatTypes.has(category)))];
}

export function getPairRoles(pairs) {
  return ['特殊攻擊型', '物理攻擊型'].filter((role) => pairs.some((pair) => matchesPairRole(pair, role)));
}

export function matchesPairRole(pair, role) {
  return pair.role === role || pair.role === '雙攻型';
}

export function getPairRoleLabel(role) {
  if (role === '物理攻擊型') return '物攻';
  if (role === '特殊攻擊型') return '特攻';
  if (role === '雙攻型') return '物攻／特攻';
  return '';
}

export function getPairLimitedTags(pairs) {
  return [...new Set(pairs.map((pair) => pair.limitedTag).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'zh'));
}

export function sortPairs(pairs, mode = 'base-desc') {
  const byBase = (left, right) => (right.baseTotal ?? 0) - (left.baseTotal ?? 0);
  return [...pairs].sort((left, right) => {
    if (mode === 'name-asc') return left.name.localeCompare(right.name, 'zh');
    if (mode === 'name-desc') return right.name.localeCompare(left.name, 'zh');
    if (mode === 'base-asc') return (left.baseTotal ?? 0) - (right.baseTotal ?? 0);
    if (mode === 'rank-desc' || mode === 'rank-asc') {
      // 無等級（未上榜）的拍組一律往後放；上榜者依等級排序，同級再按白值高→低。
      if (left.rank == null && right.rank == null) return byBase(left, right);
      if (left.rank == null) return 1;
      if (right.rank == null) return -1;
      const byRank = mode === 'rank-desc' ? right.rank - left.rank : left.rank - right.rank;
      return byRank || byBase(left, right);
    }
    return byBase(left, right);
  });
}

export const pairAttributes = ['一般', '火', '水', '電', '草', '冰', '格鬥', '毒', '地面', '飛行', '超能力', '蟲', '岩石', '幽靈', '龍', '惡', '鋼', '妖精'];

export function getAttributeOptions() {
  return ['all', ...pairAttributes];
}

// 場效（天氣／場地／領域）：code 與 parse-data.mjs 的 parsePairFieldEffects 輸出一致；
// 領域 code 即屬性名，卡片標籤直接沿用屬性配色。
export const fieldEffectDefs = [
  { kind: 'weather', code: 'sun', label: '大晴天' },
  { kind: 'weather', code: 'rain', label: '下雨' },
  { kind: 'weather', code: 'sand', label: '沙暴' },
  { kind: 'weather', code: 'hail', label: '冰雹' },
  { kind: 'terrain', code: 'electric', label: '電氣場地' },
  { kind: 'terrain', code: 'grassy', label: '青草場地' },
  { kind: 'terrain', code: 'psychic', label: '精神場地' },
  { kind: 'zone', code: '一般', label: '淨空領域' },
  { kind: 'zone', code: '冰', label: '冰柱領域' },
  { kind: 'zone', code: '格鬥', label: '拳頭領域' },
  { kind: 'zone', code: '毒', label: '劇毒領域' },
  { kind: 'zone', code: '地面', label: '大地領域' },
  { kind: 'zone', code: '飛行', label: '藍天領域' },
  { kind: 'zone', code: '蟲', label: '玉蟲領域' },
  { kind: 'zone', code: '岩石', label: '岩石領域' },
  { kind: 'zone', code: '幽靈', label: '妖怪領域' },
  { kind: 'zone', code: '龍', label: '龍之領域' },
  { kind: 'zone', code: '惡', label: '惡顏領域' },
  { kind: 'zone', code: '鋼', label: '鋼鐵領域' },
  { kind: 'zone', code: '妖精', label: '妖精領域' },
];

export function getFieldEffectOptions() {
  return fieldEffectDefs;
}

export function getFieldEffectLabel(kind, code) {
  return fieldEffectDefs.find((def) => def.kind === kind && def.code === code)?.label ?? '';
}

// 單一值比對：'ex' 比對任一ＥＸ強化場效；其餘為 kind:code 比對同名場效（ＥＸ 版也算）。
export function matchesFieldEffect(pair, value) {
  if (!value || value === 'all') return true;
  const effects = pair.fieldEffects ?? [];
  if (value === 'ex') return effects.some((effect) => effect.ex);
  const separator = value.indexOf(':');
  const kind = value.slice(0, separator);
  const code = value.slice(separator + 1);
  return effects.some((effect) => effect.kind === kind && effect.code === code);
}

// 多選組合：'ex' 是修飾子而非並列選項。與具體場效一起選時為 AND（該場效必須是 ＥＸ 強化版）；
// 只選 'ex'（沒選具體場效）時比對任一 ＥＸ 場效；空陣列＝不篩選。
export function matchesFieldEffectSelection(pair, values) {
  if (!values || values.length === 0) return true;
  const effects = pair.fieldEffects ?? [];
  const exOnly = values.includes('ex');
  const wanted = values.filter((value) => value !== 'ex' && value !== 'all');
  if (wanted.length === 0) return !exOnly || effects.some((effect) => effect.ex);
  return wanted.some((value) => {
    const separator = value.indexOf(':');
    const kind = value.slice(0, separator);
    const code = value.slice(separator + 1);
    return effects.some((effect) => effect.kind === kind && effect.code === code && (!exOnly || effect.ex));
  });
}

// 鬥陣：卡片標籤顯示完整名稱（地區＋類別），篩選只依類別（物理＝物攻、特殊＝特攻、防禦）。
export const formationCategories = [
  { value: '物理', label: '物攻' },
  { value: '特殊', label: '特攻' },
  { value: '防禦', label: '防禦' },
];

export function getFormationCategories() {
  return formationCategories;
}

export function getFormationLabel(region, category) {
  return `${region}鬥陣（${category}）`;
}

// 鬥陣晶片配色用的類別 tone；「物理／特殊」同時屬物攻與特攻。
export function formationTone(category) {
  if (category === '物理') return 'physical';
  if (category === '特殊') return 'special';
  if (category === '防禦') return 'defense';
  return 'mixed';
}

function formationCategoryMatches(selected, category) {
  if (selected === category) return true;
  return category === '物理／特殊' && (selected === '物理' || selected === '特殊');
}

// 多選組合：選物攻就命中所有物理類（含物理／特殊）鬥陣，依此類推；空陣列＝不篩選。
export function matchesFormationSelection(pair, values) {
  if (!values || values.length === 0) return true;
  return (pair.formations ?? []).some((form) => values.some((selected) => formationCategoryMatches(selected, form.category)));
}

export function getActiveFilterCount(state) {
  return ['query', 'category', 'attribute', 'role', 'rank', 'limitedTag', 'fieldEffect', 'formation', 'date', 'status']
    .filter((key) => {
      const value = state[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(value) && value !== 'all';
    }).length;
}

export function getFilterOptionLabel(filter, value) {
  if (value === 'all') return '全部';
  if (filter === 'attribute') return value;
  if (filter === 'fieldEffect') {
    if (value === 'ex') return 'ＥＸ';
    const separator = value.indexOf(':');
    return getFieldEffectLabel(value.slice(0, separator), value.slice(separator + 1));
  }
  if (filter === 'formation') return formationCategories.find((category) => category.value === value)?.label ?? value;
  if (filter === 'rank') return getRankTierLabel(Number(value));
  if (filter === 'role') return value === '物理攻擊型' ? '物攻' : value === '特殊攻擊型' ? '特攻' : value;
  if (filter === 'sort') return {
    'base-desc': '白值高→低', 'base-asc': '白值低→高',
    'name-asc': '名稱 A→Z', 'name-desc': '名稱 Z→A',
    'rank-desc': '等級高→低', 'rank-asc': '等級低→高',
  }[value] || value;
  if (filter === 'pageSize') return `${value} 筆`;
  if (filter === 'status') return { active: '進行中', upcoming: '即將開始', ended: '已結束' }[value] ?? value;
  return value;
}

export function isFilterActive(filter, value) {
  return !['sort', 'pageSize'].includes(filter) && value !== 'all';
}
