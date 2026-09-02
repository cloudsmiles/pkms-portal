import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageItems, getViewFilters, getPairCategories, getPairRoles, getPairLimitedTags, sortPairs } from '../ui-helpers.mjs';
import { sourcePath } from '../web-path.mjs';

test('子模組部署時將資料來源連結指向 sync-grid', () => {
  assert.equal(sourcePath('./grids/小智&皮卡丘.html'), './sync-grid/grids/小智&皮卡丘.html');
  assert.equal(sourcePath('./icons/avatar.png'), './sync-grid/icons/avatar.png');
  assert.equal(sourcePath(''), '');
});

test('大量頁碼時只顯示首尾、目前頁附近與省略號', () => {
  assert.deepEqual(getPageItems(10, 58), [1, 'ellipsis-left', 9, 10, 11, 'ellipsis-right', 58]);
  assert.deepEqual(getPageItems(1, 3), [1, 2, 3]);
});

test('拍組與活動使用各自的篩選項', () => {
  assert.deepEqual(getViewFilters('pairs'), ['category', 'attribute', 'role']);
  assert.deepEqual(getViewFilters('events'), ['date', 'status']);
});

test('攻擊方式篩選只顯示詳情頁存在的類型', () => {
  assert.deepEqual(getPairRoles([{ role: '特殊攻擊型' }, { role: '物理攻擊型' }, { role: '' }]), ['特殊攻擊型', '物理攻擊型']);
});

test('拍組列表支援白值與名稱排序', () => {
  const pairs = [{ name: '乙', baseTotal: 100 }, { name: '甲', baseTotal: 200 }];
  assert.deepEqual(sortPairs(pairs, 'base-desc').map((pair) => pair.name), ['甲', '乙']);
  assert.deepEqual(sortPairs(pairs, 'name-asc').map((pair) => pair.name), ['甲', '乙']);
});

test('限定標籤下拉包含所有不同限定類型', () => {
  assert.deepEqual(getPairLimitedTags([
    { limitedTag: '盛典限定' },
    { limitedTag: '季節限定' },
    { limitedTag: '盛典限定' },
    { limitedTag: '' }
  ]), ['季節限定', '盛典限定']);
});

test('拍組分類只包含戰鬥類型，不包含日期與專用潛能餅乾', () => {
  assert.deepEqual(getPairCategories([
    { category: '2026/08/28' },
    { category: '專用潛能餅乾' },
    { category: '攻擊型' },
    { category: '技術型' }
  ]), ['攻擊型', '技術型']);
});
