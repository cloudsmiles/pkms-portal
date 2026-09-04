export function getPageItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis-right', totalPages];
  if (currentPage >= totalPages - 2) return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export function getViewFilters(tab) {
  return tab === 'pairs' ? ['category', 'attribute', 'role', 'rank'] : ['date', 'status'];
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

export function getActiveFilterCount(state) {
  return ['query', 'category', 'attribute', 'role', 'rank', 'limitedTag', 'date', 'status']
    .filter((key) => state[key] && state[key] !== 'all').length;
}

export function getFilterOptionLabel(filter, value) {
  if (value === 'all') return '全部';
  if (filter === 'attribute') return value;
  if (filter === 'rank') return getRankTierLabel(Number(value));
  if (filter === 'role') return value === '物理攻擊型' ? '物攻' : value === '特殊攻擊型' ? '特攻' : value;
  if (filter === 'sort') return {
    'base-desc': '白值高→低', 'base-asc': '白值低→高',
    'name-asc': '名稱 A→Z', 'name-desc': '名稱 Z→A',
    'rank-desc': '等級高→低', 'rank-asc': '等級低→高',
  }[value] || value;
  if (filter === 'pageSize') return `${value} 筆`;
  return value;
}

export function isFilterActive(filter, value) {
  return !['sort', 'pageSize'].includes(filter) && value !== 'all';
}
