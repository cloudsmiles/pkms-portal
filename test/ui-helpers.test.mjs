import test from 'node:test';
import assert from 'node:assert/strict';
import * as uiHelpers from '../ui-helpers.mjs';
const { getPageItems, getViewFilters, getPairCategories, getPairRoles, getPairLimitedTags, sortPairs } = uiHelpers;
import { sourcePath } from '../web-path.mjs';
import { readFileSync } from 'node:fs';

test('篩選數量不包含排序與每頁數量', () => {
  assert.equal(uiHelpers.getActiveFilterCount({
    query: '小智', category: '攻擊型', attribute: '火', role: 'all',
    limitedTag: 'all', date: 'all', status: 'all', sort: 'name-asc', pageSize: 48
  }), 3);
});

test('屬性選擇器提供全部屬性與完整屬性清單', () => {
  assert.deepEqual(uiHelpers.getAttributeOptions(), ['all', ...uiHelpers.pairAttributes]);
});

test('下拉選項使用精簡且一致的顯示文案', () => {
  assert.equal(uiHelpers.getFilterOptionLabel('attribute', '草'), '草');
  assert.equal(uiHelpers.getFilterOptionLabel('role', '物理攻擊型'), '物攻');
  assert.equal(uiHelpers.getFilterOptionLabel('status', 'all'), '全部');
  assert.equal(uiHelpers.getFilterOptionLabel('pageSize', '12'), '12 筆');
});

test('排序與每頁數量的預設值不算篩選啟用', () => {
  assert.equal(uiHelpers.isFilterActive('sort', 'base-desc'), false);
  assert.equal(uiHelpers.isFilterActive('pageSize', '12'), false);
  assert.equal(uiHelpers.isFilterActive('attribute', '草'), true);
});

test('自訂下拉不使用 label 包裹互動控制項', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(/<label class="select-box custom-select/.test(html), false);
});

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
  assert.deepEqual(getViewFilters('pairs'), ['category', 'attribute', 'role', 'rank', 'fieldEffect']);
  assert.deepEqual(getViewFilters('events'), ['date', 'status']);
});

test('場效提供 20 種選項且標籤可查', () => {
  const options = uiHelpers.getFieldEffectOptions();
  assert.equal(options.length, 20);
  assert.equal(uiHelpers.getFieldEffectLabel('weather', 'sun'), '大晴天');
  assert.equal(uiHelpers.getFieldEffectLabel('terrain', 'electric'), '電氣場地');
  assert.equal(uiHelpers.getFieldEffectLabel('zone', '妖精'), '妖精領域');
  assert.equal(uiHelpers.getFilterOptionLabel('fieldEffect', 'zone:惡'), '惡顏領域');
});

test('場效篩選命中同類效果，EX 版也算命中，並支援只篩 ＥＸ', () => {
  const pair = { fieldEffects: [{ kind: 'zone', code: '飛行', ex: true }, { kind: 'weather', code: 'rain', ex: false }] };
  assert.equal(uiHelpers.matchesFieldEffect(pair, 'all'), true);
  assert.equal(uiHelpers.matchesFieldEffect(pair, 'zone:飛行'), true);
  assert.equal(uiHelpers.matchesFieldEffect(pair, 'weather:rain'), true);
  assert.equal(uiHelpers.matchesFieldEffect(pair, 'zone:妖精'), false);
  assert.equal(uiHelpers.matchesFieldEffect({}, 'zone:妖精'), false);
  // 'ex' 只要任一場效為 ＥＸ 強化版即命中
  assert.equal(uiHelpers.matchesFieldEffect(pair, 'ex'), true);
  assert.equal(uiHelpers.matchesFieldEffect({ fieldEffects: [{ kind: 'weather', code: 'rain', ex: false }] }, 'ex'), false);
  assert.equal(uiHelpers.getFilterOptionLabel('fieldEffect', 'ex'), 'ＥＸ');
});

test('ＥＸ 為在場效上的 AND 修飾：與具體場效同選時要求該場效為 ＥＸ', () => {
  const exPsychic = { fieldEffects: [{ kind: 'terrain', code: 'psychic', ex: true }] };
  const normalPsychic = { fieldEffects: [{ kind: 'terrain', code: 'psychic', ex: false }] };
  const exZoneOnly = { fieldEffects: [{ kind: 'zone', code: '格鬥', ex: true }] };
  // 不篩選＝全部；只選具體場效（不含 ＥＸ）則 ＥＸ 版與普通版都算
  assert.equal(uiHelpers.matchesFieldEffectSelection(exPsychic, []), true);
  assert.equal(uiHelpers.matchesFieldEffectSelection(exPsychic, ['terrain:psychic']), true);
  assert.equal(uiHelpers.matchesFieldEffectSelection(normalPsychic, ['terrain:psychic']), true);
  // 只選 ＥＸ＝任一 ＥＸ 場效即可
  assert.equal(uiHelpers.matchesFieldEffectSelection(exPsychic, ['ex']), true);
  assert.equal(uiHelpers.matchesFieldEffectSelection(normalPsychic, ['ex']), false);
  // 場效 + ＥＸ：該場效必須是 ＥＸ 強化版；他種場效是 ＥＸ 也不算
  assert.equal(uiHelpers.matchesFieldEffectSelection(exPsychic, ['terrain:psychic', 'ex']), true);
  assert.equal(uiHelpers.matchesFieldEffectSelection(normalPsychic, ['terrain:psychic', 'ex']), false);
  assert.equal(uiHelpers.matchesFieldEffectSelection(exZoneOnly, ['terrain:psychic', 'ex']), false);
});

test('多選篩選（陣列）正確計入啟用數量', () => {
  assert.equal(uiHelpers.getActiveFilterCount({
    query: '', category: ['攻擊型', '技術型'], attribute: ['火'], role: 'all', rank: [],
    limitedTag: [], fieldEffect: [], date: 'all', status: 'all'
  }), 2);
  assert.equal(uiHelpers.getActiveFilterCount({
    query: '皮卡', category: [], attribute: [], role: 'all', rank: ['15', '14'],
    limitedTag: [], fieldEffect: ['ex'], date: 'all', status: 'all'
  }), 3);
});

test('田雞榜等級提供 1~15 的繁中標籤（球級細分 1/2/3，自由者最高）', () => {
  assert.deepEqual(uiHelpers.rankLevels.map((tier) => tier.value), Array.from({ length: 15 }, (_, i) => 15 - i));
  assert.equal(uiHelpers.getRankTierLabel(15), '自由者');
  assert.equal(uiHelpers.getRankTierLabel(14), '冠軍');
  assert.equal(uiHelpers.getRankTierLabel(13), '大師球');
  assert.equal(uiHelpers.getRankTierLabel(12), '高級球3');
  assert.equal(uiHelpers.getRankTierLabel(10), '高級球1');
  assert.equal(uiHelpers.getRankTierLabel(9), '超級球3');
  assert.equal(uiHelpers.getRankTierLabel(1), '新手1');
  assert.equal(uiHelpers.getRankTierLabel(null), '');
  // 超級球3 < 高級球1：數值上 9 < 10；冠軍 < 自由者 14 < 15。
  assert.ok(9 < 10);
  assert.ok(14 < 15);
  assert.equal(uiHelpers.getFilterOptionLabel('rank', '15'), '自由者');
  assert.equal(uiHelpers.getFilterOptionLabel('rank', '13'), '大師球');
  assert.equal(uiHelpers.getFilterOptionLabel('sort', 'rank-desc'), '等級高→低');
  assert.equal(uiHelpers.rankFamily(15), 'free');
  assert.equal(uiHelpers.rankFamily(14), 'champion');
  assert.equal(uiHelpers.rankFamily(12), 'hyper');
  assert.equal(uiHelpers.rankFamily(7), 'super');
  assert.equal(uiHelpers.rankFamily(1), 'novice');
});

test('等級篩選計入啟用的篩選數量', () => {
  assert.equal(uiHelpers.getActiveFilterCount({
    query: '', category: 'all', attribute: 'all', role: 'all', rank: '12',
    limitedTag: 'all', date: 'all', status: 'all'
  }), 1);
});

test('依等級排序時上榜者在前、未上榜者在後', () => {
  const pairs = [
    { name: '無榜', baseTotal: 999 },
    { name: '新手1', rank: 1, baseTotal: 100 },
    { name: '冠軍', rank: 14, baseTotal: 200 },
    { name: '大師', rank: 13, baseTotal: 150 }
  ];
  assert.deepEqual(sortPairs(pairs, 'rank-desc').map((pair) => pair.name), ['冠軍', '大師', '新手1', '無榜']);
  assert.deepEqual(sortPairs(pairs, 'rank-asc').map((pair) => pair.name), ['新手1', '大師', '冠軍', '無榜']);
});

test('攻擊方式篩選只顯示詳情頁存在的類型', () => {
  assert.deepEqual(getPairRoles([{ role: '雙攻型' }]), ['特殊攻擊型', '物理攻擊型']);
});

test('雙攻型同時符合物攻與特攻篩選', () => {
  assert.equal(uiHelpers.matchesPairRole({ role: '雙攻型' }, '物理攻擊型'), true);
  assert.equal(uiHelpers.matchesPairRole({ role: '雙攻型' }, '特殊攻擊型'), true);
  assert.equal(uiHelpers.matchesPairRole({ role: '物理攻擊型' }, '特殊攻擊型'), false);
});

test('攻擊方式標籤使用精簡文案', () => {
  assert.equal(uiHelpers.getPairRoleLabel('物理攻擊型'), '物攻');
  assert.equal(uiHelpers.getPairRoleLabel('特殊攻擊型'), '特攻');
  assert.equal(uiHelpers.getPairRoleLabel('雙攻型'), '物攻／特攻');
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
