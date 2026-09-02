import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parseEventRecords, getEventStatus } from '../scripts/parse-data.mjs';
import { getProjectDir } from '../scripts/project-path.mjs';
import { injectDetailAssets } from '../scripts/build-data.mjs';

test('默认使用 portal 内的 Sync-Grid 子模块，也支持环境变量覆盖', () => {
  assert.equal(getProjectDir({ portalDir: '/tmp/portal', env: {} }), '/tmp/portal/sync-grid');
  assert.equal(getProjectDir({ portalDir: '/tmp/portal', env: { SYNC_GRID_DIR: '/data/Sync-Grid' } }), '/data/Sync-Grid');
});

test('详情页覆盖资源注入可重复执行', () => {
  const html = '<html><head></head><body></body></html>';
  const injected = injectDetailAssets(html);
  assert.match(injected, /detail-style\.css/);
  assert.match(injected, /detail-ui\.js/);
  assert.equal(injectDetailAssets(injected), injected);
});

test('解析拍組連結時保留分類、名稱、圖片與網址', () => {
  const markdown = `### 攻擊型\n<a href="./grids/小智&皮卡丘.html"><img src="./icons/小智&皮卡丘.png" width="64">小智&皮卡丘</a><br>\n### 技術型\n<a href="./grids/無圖片.html">無圖片</a>`;

  assert.deepEqual(parsePairRecords(markdown), [
    { category: '攻擊型', name: '小智&皮卡丘', href: './grids/小智&皮卡丘.html', image: './icons/小智&皮卡丘.png' },
    { category: '技術型', name: '無圖片', href: './grids/無圖片.html', image: '' }
  ]);
});

test('拍組只收錄六大分類並移除重複連結', () => {
  const markdown = `### 2026/08/28\n<a href="./grids/預覽.html">預覽</a>\n### 攻擊型\n<a href="./grids/小智&皮卡丘.html">小智&皮卡丘</a>\n### 技術型\n<a href="./grids/小智&皮卡丘.html">小智&皮卡丘</a>\n<a href="./grids/小春.html">小春</a>\n### 專用潛能餅乾\n<a href="./grids/餅乾.html">餅乾</a>`;

  assert.deepEqual(parsePairRecords(markdown), [
    { category: '攻擊型', name: '小智&皮卡丘', href: './grids/小智&皮卡丘.html', image: '' },
    { category: '技術型', name: '小春', href: './grids/小春.html', image: '' }
  ]);
});

test('解析活動段落時拆出日期、標題、描述與圖片', () => {
  const html = `<p>\n2026/08/28 14:00 - 2026/09/13 14:00\n活動標題\n活動說明\n<img src="./events/banner.png" />\n</p>`;

  assert.deepEqual(parseEventRecords(html), [{
    start: '2026-08-28T14:00:00',
    end: '2026-09-13T14:00:00',
    title: '活動標題',
    description: '活動說明',
    image: './events/banner.png'
  }]);
});

test('從拍組詳情底部標籤解析屬性', () => {
  const grid = '<table class="team"><tr><td>飛行屬性<br>／攻擊</td><td>關都<br>／攻擊</td></tr><tr><td>水屬性<br>／輔助</td></tr></table>';
  assert.deepEqual(parsePairAttributes(grid), ['飛行', '水']);
});

test('從拍組詳情體系欄位解析攻擊方式', () => {
  const grid = '<table><tr><td>體系</td><td>EX體系</td><td>弱點</td></tr><tr><td>技術型</td><td>特殊攻擊型</td><td>岩石</td></tr></table>';
  assert.equal(parsePairRole(grid), '特殊攻擊型');
});

test('只從基本資料標題解析限定標籤，不包含拍組搜尋', () => {
  assert.equal(parsePairLimitedTag('<table><tr><th>大師盛典限定★5 美月&奈克洛茲瑪</th></tr></table>'), '大師盛典限定');
  assert.equal(parsePairLimitedTag('<table><tr><th>拍組搜尋★5 美月&奈克洛茲瑪</th></tr></table>'), '');
});

test('從等級表計算Lv.200六項白值總和', () => {
  const grid = '<table><tr><td>Lv.</td><td>1</td><td>100</td><td>140</td><td>180</td><td>200</td></tr><tr><td>ＨＰ</td><td>102</td><td>552</td><td>680</td><td>808</td><td>872</td></tr><tr><td>攻擊</td><td>24</td><td>326</td><td>414</td><td>502</td><td>546</td></tr><tr><td>防禦</td><td>13</td><td>116</td><td>148</td><td>180</td><td>196</td></tr><tr><td>特攻</td><td>17</td><td>264</td><td>336</td><td>408</td><td>444</td></tr><tr><td>特防</td><td>14</td><td>129</td><td>161</td><td>193</td><td>209</td></tr><tr><td>速度</td><td>12</td><td>259</td><td>331</td><td>403</td><td>439</td></tr></table>';
  assert.equal(parsePairBaseTotal(grid), 2706);
});

test('活動狀態按指定日期判斷進行中、即將開始與已結束', () => {
  assert.equal(getEventStatus({ start: '2026-08-28T14:00:00', end: '2026-09-13T14:00:00' }, new Date('2026-08-30')), 'active');
  assert.equal(getEventStatus({ start: '2026-09-05T14:00:00', end: '2026-09-13T14:00:00' }, new Date('2026-08-30')), 'upcoming');
  assert.equal(getEventStatus({ start: '2026-08-01T14:00:00', end: '2026-08-13T14:00:00' }, new Date('2026-08-30')), 'ended');
});
