export function getPageItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis-right', totalPages];
  if (currentPage >= totalPages - 2) return [1, 'ellipsis-left', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis-left', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-right', totalPages];
}

export function getViewFilters(tab) {
  return tab === 'pairs' ? ['category', 'attribute', 'role'] : ['date', 'status'];
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
  return [...pairs].sort((left, right) => {
    if (mode === 'name-asc') return left.name.localeCompare(right.name, 'zh');
    if (mode === 'name-desc') return right.name.localeCompare(left.name, 'zh');
    if (mode === 'base-asc') return (left.baseTotal ?? 0) - (right.baseTotal ?? 0);
    return (right.baseTotal ?? 0) - (left.baseTotal ?? 0);
  });
}

export const pairAttributes = ['一般', '火', '水', '電', '草', '冰', '格鬥', '毒', '地面', '飛行', '超能力', '蟲', '岩石', '幽靈', '龍', '惡', '鋼', '妖精'];

export function getAttributeOptions() {
  return ['all', ...pairAttributes];
}

export function getActiveFilterCount(state) {
  return ['query', 'category', 'attribute', 'role', 'limitedTag', 'date', 'status']
    .filter((key) => state[key] && state[key] !== 'all').length;
}

export function getFilterOptionLabel(filter, value) {
  if (value === 'all') return '全部';
  if (filter === 'attribute') return value;
  if (filter === 'role') return value === '物理攻擊型' ? '物攻' : value === '特殊攻擊型' ? '特攻' : value;
  if (filter === 'sort') return { 'base-desc': '白值高→低', 'base-asc': '白值低→高', 'name-asc': '名稱 A→Z', 'name-desc': '名稱 Z→A' }[value] || value;
  if (filter === 'pageSize') return `${value} 筆`;
  return value;
}

export function isFilterActive(filter, value) {
  return !['sort', 'pageSize'].includes(filter) && value !== 'all';
}
