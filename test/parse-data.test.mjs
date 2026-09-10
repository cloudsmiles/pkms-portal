import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePairRecords, parsePairAttributes, parsePairRole, parsePairLimitedTag, parsePairBaseTotal, parsePairFieldEffects, parsePairEffects, parseEventRecords, getEventStatus } from '../scripts/parse-data.mjs';
import { getProjectDir } from '../scripts/project-path.mjs';
import { injectDetailAssets } from '../scripts/build-data.mjs';

test('默认使用 portal 内的 Sync-Grid 子模块，也支持环境变量覆盖', () => {
  assert.equal(getProjectDir({ portalDir: '/tmp/portal', env: {} }), '/tmp/portal/sync-grid');
  assert.equal(getProjectDir({ portalDir: '/tmp/portal', env: { SYNC_GRID_DIR: '/data/Sync-Grid' } }), '/data/Sync-Grid');
});

test('详情页覆盖资源注入可重复执行', () => {
  const html = '<html><head></head><body></body></html>';
  const injected = injectDetailAssets(html);
  assert.match(injected, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(injected, /detail-style\.css/);
  assert.match(injected, /detail-ui\.js/);
  assert.equal(injectDetailAssets(injected), injected);
});

test('详情页返回链接默认回主页，并可用 back 参数保留清单查询', async () => {
  const script = await readFile(new URL('../overrides/detail-ui.js', import.meta.url), 'utf8');
  assert.match(script, /get\('back'\)/);
  assert.match(script, /return\s+['"]\.\.\/\.\.\/index\.html['"]/);
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

test('攻擊型從拍組詳情體系欄位解析攻擊方式', () => {
  const grid = '<table><tr><td>體系</td><td>EX體系</td><td>弱點</td></tr><tr><td>攻擊型</td><td>特殊攻擊型</td><td>岩石</td></tr></table>';
  assert.equal(parsePairRole(grid), '特殊攻擊型');
});

test('明確標示物攻的攻擊型不依招式重新推導', () => {
  const grid = '<table><tr><td>體系</td><td>EX體系</td></tr><tr><td>物理攻擊型</td><td>技術型</td></tr></table><table class="move"><tr><td>分類</td><td>特殊</td></tr></table>';
  assert.equal(parsePairRole(grid), '物理攻擊型');
});

test('非攻擊型依招式分類推導物攻、特攻或雙攻', () => {
  const physical = '<table><tr><td>體系</td><td>EX體系</td></tr><tr><td>技術型</td><td>輔助型</td></tr></table><table class="move"><tr><td>分類</td><td>物理</td></tr></table>';
  const special = '<table><tr><td>體系</td><td>EX體系</td></tr><tr><td>場地型</td><td>技術型</td></tr></table><table class="move"><tr><td>分類</td><td>特殊</td></tr></table>';
  const mixed = '<table><tr><td>體系</td><td>EX體系</td></tr><tr><td>複合型</td><td>技術型</td></tr></table><table class="move"><tr><td>分類</td><td>物理</td></tr></table><table class="move"><tr><td>分類</td><td>特殊</td></tr></table>';

  assert.equal(parsePairRole(physical), '物理攻擊型');
  assert.equal(parsePairRole(special), '特殊攻擊型');
  assert.equal(parsePairRole(mixed), '雙攻型');
});

test('只從基本資料標題解析限定標籤，不包含拍組搜尋', () => {
  assert.equal(parsePairLimitedTag('<table><tr><th>大師盛典限定★5 美月&奈克洛茲瑪</th></tr></table>'), '大師盛典限定');
  assert.equal(parsePairLimitedTag('<table><tr><th>拍組搜尋★5 美月&奈克洛茲瑪</th></tr></table>'), '');
});

test('從招式與被動描述解析天氣、場地、領域', () => {
  const grid = [
    '<table class="move"><tr><td>招式</td><td>使出招式時，會將天氣變成下雨。</td></tr></table>',
    '<table class="passive"><tr><td>被動</td><td>首次上場時，會將場地變成電氣場地。</td></tr></table>',
    '<table class="passive"><tr><td>被動</td><td>會將領域變成妖精領域。<br>（妖精領域會提高妖精屬性的攻擊的威力。）</td></tr></table>'
  ].join('');

  assert.deepEqual(parsePairFieldEffects(grid), [
    { kind: 'weather', code: 'rain', ex: false, gridLevel: null },
    { kind: 'terrain', code: 'electric', ex: false, gridLevel: null },
    { kind: 'zone', code: '妖精', ex: false, gridLevel: null }
  ]);
});

test('石盤嵌入資料裡的場效設定句也能解析，並帶上該 tile 的石盤等級', () => {
  const grid = `<script>const tiles = [[1014011049, '首次上場時變成惡顏領域', '首次上場時，會將領域變成惡顏領域。\\n（惡顏領域會提高惡屬性的攻擊的威力。）', 7, 84, 2, 'e6ce5e', 0, 0, []]];</script>`;
  assert.deepEqual(parsePairFieldEffects(grid), [{ kind: 'zone', code: '惡', ex: false, gridLevel: 2 }]);
});

test('ＥＸ強化版場效標記為 ex，且與普通版去重後保留 ex', () => {
  const exZone = '<table class="move"><tr><td>首次使出此招式攻擊成功時，會將領域變成ＥＸ玉蟲領域。<br>（ＥＸ玉蟲領域會提高蟲屬性的攻擊的威力。）</td></tr></table>';
  assert.deepEqual(parsePairFieldEffects(exZone), [{ kind: 'zone', code: '蟲', ex: true, gridLevel: null }]);

  const exWeather = '會將天氣變成ＥＸ下雨。';
  assert.deepEqual(parsePairFieldEffects(exWeather), [{ kind: 'weather', code: 'rain', ex: true, gridLevel: null }]);

  const exTerrain = '會將場地變成ＥＸ精神場地。';
  assert.deepEqual(parsePairFieldEffects(exTerrain), [{ kind: 'terrain', code: 'psychic', ex: true, gridLevel: null }]);

  const both = '會將領域變成藍天領域。會將領域變成ＥＸ藍天領域。';
  assert.deepEqual(parsePairFieldEffects(both), [{ kind: 'zone', code: '飛行', ex: true, gridLevel: null }]);
});

test('超覺醒被動提供的場效標記 sa，與一般來源共存時仍保留；一般被動不標', () => {
  const saTable = '<table class="passive" style="background-color:#4ce1f780"><tr><td>超覺醒被動技能：測試被動<br>首次上場時，<br>會將天氣變成下雨。</td></tr></table>';
  assert.deepEqual(parsePairFieldEffects(saTable), [
    { kind: 'weather', code: 'rain', ex: false, gridLevel: null, sa: true }
  ]);

  const normalPassive = '<table class="passive"><tr><td>登場時，會將天氣變成沙暴。</td></tr></table>';
  assert.deepEqual(parsePairFieldEffects(normalPassive), [
    { kind: 'weather', code: 'sand', ex: false, gridLevel: null }
  ]);

  const mixed = saTable + '<table class="move"><tr><td>出招時，會將領域變成惡顏領域。</td></tr></table>';
  assert.deepEqual(parsePairFieldEffects(mixed), [
    { kind: 'weather', code: 'rain', ex: false, gridLevel: null, sa: true },
    { kind: 'zone', code: '惡', ex: false, gridLevel: null }
  ]);
});

test('條件句與延長持續時間不計為場效', () => {
  const grid = [
    '將天氣變成日照強烈時，會提高火屬性招式的威力。',
    '只有在天氣、場地或領域變化時，才會發動此被動。',
    '當領域為妖精領域時，招式計量槽會增加。',
    '當我方使天氣、場地或領域生效時，會賦予增強效果。',
    '上場時，會延長妖精領域的持續時間。',
    '領域變成劇毒領域的瞬間，會降低對手防禦。'
  ].join('');
  assert.deepEqual(parsePairFieldEffects(grid), []);
});

test('解析鬥陣（地區＋類別），條件句與延長句不誤抓', () => {
  const grid = [
    '<table class="move"><tr><td>首次使出拍組招式時，會讓我方場地變成伽勒爾鬥陣（防禦）。</td></tr></table>',
    '<table class="passive"><tr><td>登場時場地變成卡洛斯鬥陣（物理）。</td></tr></table>'
  ].join('');
  const { formations } = parsePairEffects(grid);
  assert.deepEqual(formations, [
    { region: '卡洛斯', category: '物理', ex: false, gridLevel: null },
    { region: '伽勒爾', category: '防禦', ex: false, gridLevel: null }
  ]);

  const noise = [
    '當我方場地為伽勒爾鬥陣（防禦）時，招式威力提升。',
    '會延長帕底亞鬥陣（特殊）的持續時間。',
    '我方場地變成任一鬥陣時，會提高能力。',
    '我方場地變成任一卡洛斯鬥陣時，會發動效果。'
  ].join('');
  assert.deepEqual(parsePairEffects(noise).formations, []);
});

test('物理／特殊鬥陣能解析成獨立類別', () => {
  const { formations } = parsePairEffects('會讓我方場地變成帕底亞鬥陣（物理／特殊）。');
  assert.deepEqual(formations, [{ region: '帕底亞', category: '物理／特殊', ex: false, gridLevel: null }]);
});

test('只在石盤 tile 的場效／鬥陣會標上所需石盤等級，招式被動有的則不標', () => {
  // 精神場地只出現在等級 5 的石盤 tile；拳頭領域出現在一般被動。
  const grid = [
    '<table class="passive"><tr><td>會將領域變成拳頭領域。</td></tr></table>',
    `<script>json = [[1800101162, '被動', '首次以歌聲形態出招時，\\n會將場地變成精神場地。', 0, 0, 5, 'e1768a', 0, 2, []],
    [1800101163, '被動', '登場時場地變成關都鬥陣（物理）。', 0, 0, 3, 'e1768a', 0, -2, []]];</script>`
  ].join('');
  const { fieldEffects, formations } = parsePairEffects(grid);
  assert.deepEqual(fieldEffects, [
    { kind: 'terrain', code: 'psychic', ex: false, gridLevel: 5 },
    { kind: 'zone', code: '格鬥', ex: false, gridLevel: null }
  ]);
  assert.deepEqual(formations, [{ region: '關都', category: '物理', ex: false, gridLevel: 3 }]);
});

test('日照強烈的狀態正規化為 sun 且四種天氣三種場地都能解析', () => {
  const grid = ['將天氣變成日照強烈的狀態。', '將天氣變成沙暴。', '將天氣變成冰雹。', '將場地變成青草場地。'].join('');
  assert.deepEqual(parsePairFieldEffects(grid), [
    { kind: 'weather', code: 'sun', ex: false, gridLevel: null },
    { kind: 'weather', code: 'sand', ex: false, gridLevel: null },
    { kind: 'weather', code: 'hail', ex: false, gridLevel: null },
    { kind: 'terrain', code: 'grassy', ex: false, gridLevel: null }
  ]);
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
