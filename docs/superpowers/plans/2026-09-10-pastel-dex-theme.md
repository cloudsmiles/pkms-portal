# 粉彩圖鑑主題 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把入口頁整體視覺從「深色全屏照片」翻成 spec 定義的「粉彩圖鑑」淺色主題——奶油薄荷底、Zen Maru Gothic 圓體標題、salina 只在 hero 區邊緣虛化漸隱、白色貼紙卡片。

**Architecture:** 純視覺改造。`index.html` 結構不重寫；所有新樣式落在 `styles.css`（逐段取代既有規則，不新增並存的第二套樣式表）；可愛圓體以 woff2 分片自託管於 `assets/fonts/zen-maru/`，由一次性腳本 `scripts/fetch-font.mjs` 取得；app.js 預期零改動；detail 石盤頁（`overrides/`）不碰。

**Tech Stack:** 原生 CSS（mask-image、color-mix、flex/grid）、Node 內建 fetch（Node 18+，無新依賴）、Google Fonts css2 API（只在抓字形時連一次，執行期離線）。

**Spec:** `docs/superpowers/specs/2026-09-10-pastel-dex-theme-design.md`

## Global Constraints

- UI 文案一律繁體中文（spec §1）。
- 只改 `styles.css`、`index.html`、`assets/fonts/zen-maru/`（新增）、`scripts/fetch-font.mjs`（新增）、`package.json`（加 npm scripts 一行）；不動 app.js、ui-helpers.mjs、build-data.mjs、overrides/、rank/。
- 18 個屬性淡色表、七種 rank 徽章、七場效七地形色名都以 spec §5 映射表為準；篩選彈窗色點維持飽和原色。
- 字體 display=swap；標題最壞情況回退 PingFang TC 0 阻塞渲染。
- 每個 Task 結束都要：`npm test`（CSS 不影響測試，但作為回歸閘）→ `npm run build` → headless Chrome 截圖目視把關 → scoped commit。
- git add 只 add 本 plan 列出的檔案，不帶入工作區其他既有變更（.gitignore 例外，含 .superpowers/ 忽略）。
- 本 plan 的 CSS 寫法以 styles.css 既有的單行壓縮風格寫入（與檔案現況一致）；新增塊可自行換行，但不重新排版整個檔案。

---

### Task 1: 字體管線與文檔提交

**Files:**
- Create: `scripts/fetch-font.mjs`
- Modify: `package.json`
- Modify: `index.html:7`（字體 link）
- Create: `assets/fonts/zen-maru/`（腳本產生 css＋woff2＋OFL）
- Commit: `docs/superpowers/`（spec＋plan）、`.gitignore`

**Interfaces:**
- Produces: `./assets/fonts/zen-maru/zen-maru.css`，內含 family 名 `'Zen Maru Gothic'`（500/700/900），src 指向同目錄 woff2；後續 Task 的 CSS 直接引用此 family 名。

- [ ] **Step 1: 先提交 spec、plan 與 .gitignore**

```bash
git add .gitignore docs/superpowers
git commit -m "docs: 粉彩圖鑑主題設計 spec 與實施計畫"
```

`.gitignore` 尾端應有 `.superpowers/`；若沒有，先 append 這行。

- [ ] **Step 2: 寫下載腳本 `scripts/fetch-font.mjs`**

```js
// 一次性腳本：以現代瀏覽器 UA 向 Google Fonts css2 API 取得 Zen Maru Gothic
// 500/700/900 的 woff2 unicode-range 分片，存進 assets/fonts/zen-maru，
// 並把 @font-face 的 src 改寫成相對路徑。重新執行即可更新字形。需連網。
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = resolve(import.meta.dirname, '..', 'assets', 'fonts', 'zen-maru');
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap';
const OFL_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/OFL.txt';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const cssResponse = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
if (!cssResponse.ok) throw new Error(`Google Fonts CSS 下載失敗：${cssResponse.status}`);
const sourceCss = await cssResponse.text();

// 只留 font-display 一次，把每個 @font-face {...} 區塊切出來。
const blocks = [];
for (const match of sourceCss.matchAll(/@font-face\s*\{[^}]*\}/g)) blocks.push(match[0]);
if (blocks.length === 0) throw new Error('沒解析到任何 @font-face，UA 可能被導向舊版 ttf');

let rewritten = '/* 由 scripts/fetch-font.mjs 自動產生，請勿手動編輯。 */\n';
await mkdir(OUT_DIR, { recursive: true });

for (const block of blocks) {
  const weight = block.match(/font-weight:\s*(\d+)/)?.[1] ?? '400';
  const src = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
  if (!src) continue;
  const stamp = src.match(/\/s\/([^/)]+)\.woff2/)?.[1] ?? Math.random().toString(36).slice(2, 10);
  const fileName = `zen-maru-${weight}-${stamp.slice(0, 10)}.woff2`;
  const fontResponse = await fetch(src);
  if (!fontResponse.ok) throw new Error(`woff2 下載失敗：${src}`);
  await writeFile(resolve(OUT_DIR, fileName), Buffer.from(await fontResponse.arrayBuffer()));
  rewritten += `\n${block.replace(src, `./${fileName}`)}\n`;
}

const oflResponse = await fetch(OFL_URL);
if (oflResponse.ok) {
  await writeFile(resolve(OUT_DIR, 'OFL.txt'), await oflResponse.text());
} else {
  console.warn('OFL 下載失敗，請手動至 ofl/zenmarugothic/OFL.txt 補上授權檔');
}
await writeFile(resolve(OUT_DIR, 'zen-maru.css'), rewritten, 'utf8');
console.log(`已寫入 ${blocks.length} 個 @font-face → ${OUT_DIR}`);
```

- [ ] **Step 3: package.json 加 scripts 條目**

在 `"rank": ...` 那行後加一行（注意逗號）：

```json
    "fonts": "node scripts/fetch-font.mjs",
```

- [ ] **Step 4: 執行腳本，驗證產出**

Run: `npm run fonts`
Expected: `已寫入 N 個 @font-face → …/assets/fonts/zen-maru`，目錄內有 `zen-maru.css`、多個 `.woff2`、`OFL.txt`。

驗證 css 沒有 gstatic 外部網址：

```bash
! grep -q "fonts.gstatic.com" assets/fonts/zen-maru/zen-maru.css && echo LOCAL-OK
```

Expected: `LOCAL-OK`

- [ ] **Step 5: index.html 引入自託管字體**

在 index.html:7 的 `<link rel="stylesheet" href="./styles.css">` 之前插入一行：

```html
  <link rel="stylesheet" href="./assets/fonts/zen-maru/zen-maru.css">
```

- [ ] **Step 6: 構建並確認字體進 dist**

Run: `npm run build`
Then:

```bash
ls dist/assets/fonts/zen-maru | head -5
[ -f dist/assets/fonts/zen-maru/zen-maru.css ] && echo FONT-IN-DIST-OK
```

Expected: 列出 woff2 分片並印出 `FONT-IN-DIST-OK`（build-data.mjs:98 已複製整個 assets/，不用改構建腳本）。

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch-font.mjs package.json index.html assets/fonts/zen-maru
git commit -m "feat(theme): 自託管 Zen Maru Gothic 圓體分片"
```

---

### Task 2: 色板、底層排版與 hero 主視覺

**Files:**
- Modify: `styles.css:1`（去掉 Space Grotesk）
- Modify: `styles.css:3`（token 翻淺）
- Modify: `styles.css:6-8`（刪除全屏背景層）
- Modify: `styles.css:12-22`（hero、mark、標題、note、tabs）

**Interfaces:**
- Produces: CSS 自訂屬性 `--mint-ink/--mint-soft/--mint-chip/--orange-soft/--shadow-card/--shadow-control/--shadow-menu`，後續 Task 全部依賴這些 token 名。
- Consumes: Task 1 的 `'Zen Maru Gothic'` family。

**中態說明：** 此 Task 完成後頁面是奶油底＋淺色 hero，但卡片/篩選仍是舊深色塊（深色在奶油底上可讀，只是還不協調），Task 3–5 依序翻新。

- [ ] **Step 1: 字體 import 與 token**

styles.css:1 取代為（移除 Space Grotesk，只留 Noto）：

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap');
```

styles.css:3 的 `:root` 取代為：

```css
:root { --ink: #23302d; --muted: #6d857e; --bg: #f4faf7; --panel: #ffffff; --line: #dce9e3; --mint: #2fae86; --mint-ink: #176b52; --mint-soft: #d9f5ea; --mint-chip: #e7f9f2; --orange: #d98a3c; --orange-soft: #ffe6cc; --danger: #e25c54; --shadow-card: 0 6px 16px rgba(31,74,61,.10); --shadow-control: 0 3px 8px rgba(31,74,61,.06); --shadow-menu: 0 16px 32px rgba(31,74,61,.16); }
```

- [ ] **Step 2: 刪除全屏照片層，hero 掛載新背景層**

刪除 styles.css:6-8（註解＋`body::before`＋`body::after` 三行）。

styles.css:12 的 `.hero` 取代為以下五條（含兩層偽元素、內容抬層）：

```css
.hero { position: relative; isolation: isolate; overflow: hidden; display: grid; grid-template-columns: auto 1fr auto; gap: 22px; align-items: center; min-height: 240px; border-bottom: 2px solid var(--mint-soft); }
.hero::before { content: ''; position: absolute; inset: -30px; z-index: -2; background: url('./assets/salina.jpeg') center/cover no-repeat; filter: blur(26px) saturate(1.08); opacity: .5; -webkit-mask-image: radial-gradient(120% 100% at 50% 40%, #000 55%, transparent 85%), linear-gradient(180deg, #000 50%, transparent 90%); mask-image: radial-gradient(120% 100% at 50% 40%, #000 55%, transparent 85%), linear-gradient(180deg, #000 50%, transparent 90%); }
.hero::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(244,250,247,.05) 35%, rgba(244,250,247,.78) 82%, var(--bg) 100%), url('./assets/salina.jpeg') 60% 40%/contain no-repeat; -webkit-mask-image: radial-gradient(70% 84% at 60% 40%, #000 45%, rgba(0,0,0,.5) 63%, transparent 82%); mask-image: radial-gradient(70% 84% at 60% 40%, #000 45%, rgba(0,0,0,.5) 63%, transparent 82%); }
.hero > * { position: relative; z-index: 1; }
```

注意：多層 mask 的第一層 radial 讓四邊淡出（含左右直邊），第二層 linear 讓底部快速融入；兩偽元素都必須同時寫 `-webkit-mask-image` 與 `mask-image`。

- [ ] **Step 3: hero 元件、標題、note、tabs**

styles.css:13-22 逐行取代為：

```css
.hero-mark { width: 74px; height: 74px; display: grid; place-items: center; border: 0; border-radius: 18px; color: #fff; background: linear-gradient(135deg, #65e0bd, #2fae86); font: 900 23px 'Zen Maru Gothic', 'PingFang TC', sans-serif; letter-spacing: -1px; transform: rotate(-6deg); box-shadow: var(--shadow-control); }
.hero-mark span { color: #fff3d6; }
.eyebrow { margin: 0 0 10px; color: var(--mint-ink); font: 700 11px 'Zen Maru Gothic', 'PingFang TC', sans-serif; letter-spacing: .14em; }
h1, h2 { margin: 0; letter-spacing: 0; line-height: 1.15; font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; color: var(--ink); }
h1 { font-size: clamp(34px, 5.4vw, 60px); font-weight: 900; text-shadow: 0 2px 0 rgba(255,255,255,.7); }
h2 { font-size: clamp(24px, 3.4vw, 34px); font-weight: 900; }
.hero-copy { color: var(--muted); margin: 16px 0 0; font-size: 15px; }
.hero-copy::after { content: ' ✿'; color: var(--mint); }
.hero-note { align-self: start; margin-top: 35px; padding: 7px 13px; border: 1.5px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.85); color: var(--muted); font-size: 12px; white-space: nowrap; }
.live-dot { display: inline-block; width: 7px; height: 7px; background: var(--mint); border-radius: 50%; margin-right: 7px; }
.tabs { display: flex; gap: 28px; border-bottom: 1px solid var(--line); margin-top: 34px; }
.tab { color: var(--muted); background: transparent; border: 0; border-bottom: 3px solid transparent; padding: 0 4px 14px; cursor: pointer; font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; font-weight: 700; }
.tab.is-active { color: var(--ink); border-color: var(--mint); }
.tab span { color: var(--mint-ink); background: var(--mint-soft); border-radius: 999px; padding: 1px 8px; font: 700 11px 'Zen Maru Gothic', 'PingFang TC', sans-serif; margin-left: 6px; }
```

- [ ] **Step 4: 構建、截圖驗證**

```bash
npm test && npm run build
```

預期測試全綠、build 印出與現況相同的拍組/活動數。

```bash
(python3 -m http.server 8761 --directory dist >/dev/null 2>&1 &)
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --window-size=1280,900 --screenshot=/tmp/task2.png "http://localhost:8761/" 2>/dev/null
```

用 Read 工具看 `/tmp/task2.png`，驗收點：
1. 整頁奶油底（最外圍不再是深色）；
2. salina 中央可辨識、四邊與底部看不到直邊或硬切，自然溶進奶油底；
3. 帕希歐資料庫標題是圓體、深墨綠、白柔影；標語尾有 ✿；
4. SG 貼紙是薄荷漸層圓角方塊、略傾斜；
5. 下方舊深色卡片/篩選仍清楚可讀（中態，稍後翻新）。

任一點失敗就修 CSS 再截，不要進下一步。

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "feat(theme): 粉彩 token、hero 邊緣虛化背景與圓體標題"
```

---

### Task 3: 篩選工具列淺色化

**Files:**
- Modify: `styles.css:23-26`（search/select 觸發器）
- Modify: `styles.css:27-29`（刪死規則 attribute-picker/menu/option/swatch）
- Modify: `styles.css:31-35`（custom select 彈窗、active-filters、clear）
- Modify: `styles.css:202-212`（fieldeffect 彈窗黃色選項在白底的對比）

**Interfaces:**
- Consumes: Task 2 的 token。

**死規則確認：** `.attribute-picker`、`.attribute-menu`、`.attribute-option`、`.attribute-swatch`、`.attribute-check` 在現行 app.js 完全不產出（彈窗用的是 `.select-menu/.select-option`，app.js:151-195），可整段刪除。

- [ ] **Step 1: 搜尋框與下拉觸發器**

styles.css:23 的 `.toolbar`/`.search-box` 整行取代為：

```css
.toolbar { display: flex; gap: 10px; margin: 26px 0 48px; flex-wrap: wrap; }
.search-box { flex: 1 1 290px; min-width: 220px; display: flex; gap: 10px; align-items: center; color: var(--mint); border: 1.5px solid var(--line); border-radius: 14px; background: #fff; box-shadow: var(--shadow-control); padding: 0 14px; height: 48px; }
.search-box span { font-size: 27px; line-height: 0; transform: rotate(-15deg); }
.search-box input { width: 100%; border: 0; outline: 0; color: var(--ink); background: transparent; font-size: 14px; }
.search-box::placeholder { color: var(--muted); }
.search-box:focus-within { border-color: var(--mint); box-shadow: 0 0 0 3px rgba(47,174,134,.14), var(--shadow-control); }
```

styles.css:24-26 三行取代為：

```css
.select-box { display: flex; align-items: center; gap: 9px; height: 48px; border: 1.5px solid var(--line); border-radius: 14px; background: #fff; box-shadow: var(--shadow-control); padding: 0 13px; color: var(--muted); font-size: 12px; transition: border-color .2s, background .2s; }
.select-box[hidden] { display: none; }
.select-box:hover { border-color: #9ad8c5; }
.select-box select { appearance: none; color: var(--ink); background: transparent; border: 0; outline: 0; padding-right: 16px; cursor: pointer; font-size: 13px; }
.select-box select option { background: #fff; color: var(--ink); }
.select-box strong { color: var(--ink); font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.select-box.is-active { border-color: var(--mint); background: var(--mint-chip); color: var(--mint-ink); }
.select-box.is-active > span { color: var(--mint-ink); }
```

- [ ] **Step 2: 刪除死規則**

把 styles.css:27（`.attribute-picker ...`）、28（`.attribute-menu ...`）、29（`.attribute-option ...`）三行**整行刪除**。保留 `.select-chevron`——它是活的，把它獨立成一行放在原 27 行位置：

```css
.select-chevron { width: 7px; height: 7px; margin-left: auto; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg) translateY(-2px); }
```

- [ ] **Step 3: 自訂下拉彈窗**

styles.css:31 的 `.custom-select`/`.select-trigger`/`.select-menu`/`.select-option`/`.attribute-select ...` 整行取代為（屬性彈窗加回 9px 飽和色點，取代舊 33 行被禁用的點）：

```css
.custom-select { position: relative; min-width: 126px; }
.custom-select > span { color: var(--muted); white-space: nowrap; }
.select-trigger { min-width: 74px; flex: 1; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; color: var(--ink); background: transparent; cursor: pointer; text-align: left; }
.select-trigger strong { max-width: 132px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
.select-trigger:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }
.select-menu { position: absolute; z-index: 10; top: calc(100% + 8px); left: -1px; min-width: 100%; padding: 6px; border: 1.5px solid var(--line); border-radius: 14px; background: #fff; box-shadow: var(--shadow-menu); }
.select-menu[hidden] { display: none; }
.select-option { position: relative; width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 36px; padding: 7px 9px; border: 1px solid transparent; border-radius: 10px; color: var(--muted); background: transparent; cursor: pointer; font-size: 12px; text-align: left; white-space: nowrap; }
.select-option:hover, .select-option:focus-visible, .select-option.is-selected { color: var(--ink); border-color: var(--mint); background: var(--mint-chip); outline: none; }
.option-check { color: var(--mint); font-size: 13px; }
.attribute-select .select-menu { min-width: 268px; display: grid; grid-template-columns: repeat(3, minmax(76px, 1fr)); gap: 5px; }
.attribute-select .select-option { justify-content: center; gap: 5px; min-height: 42px; padding: 5px 3px; }
.attribute-select .select-option::before { content: ''; width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--muted); }
.attribute-select .select-option[data-value="all"]::before { background: linear-gradient(100deg,#f15c4f,#f5b81d,#54c46a,#3f8cff,#8e5bf0); }
.attribute-select .select-option.attribute-1::before { background: #bd3437; }
.attribute-select .select-option.attribute-2::before { background: #55b8e2; }
.attribute-select .select-option.attribute-3::before { background: #dcb40a; }
.attribute-select .select-option.attribute-4::before { background: #459e4e; }
.attribute-select .select-option.attribute-5::before { background: #94c9cb; }
.attribute-select .select-option.attribute-6::before { background: #d57741; }
.attribute-select .select-option.attribute-7::before { background: #784a91; }
.attribute-select .select-option.attribute-8::before { background: #975939; }
.attribute-select .select-option.attribute-9::before { background: #4971dd; }
.attribute-select .select-option.attribute-10::before { background: #c34b78; }
.attribute-select .select-option.attribute-11::before { background: #9cb558; }
.attribute-select .select-option.attribute-12::before { background: #85725f; }
.attribute-select .select-option.attribute-13::before { background: #a0739b; }
.attribute-select .select-option.attribute-14::before { background: #1284a1; }
.attribute-select .select-option.attribute-15::before { background: #4a4759; }
.attribute-select .select-option.attribute-16::before { background: #7f889c; }
.attribute-select .select-option.attribute-17::before { background: #ed9bb8; }
```

- [ ] **Step 4: 刪舊覆蓋與 active-filters、clear 翻新**

刪除 styles.css:33（`.attribute-select .select-option::before { display:none !important }`）與 styles.css:34（`[hidden] !important`），它們已被 Step 3 的規則取代且會擋色點。

styles.css:32（`.active-filters` 整行）取代為：

```css
.active-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: -30px 0 38px; min-height: 0; }
.active-filters:empty { display: none; }
.active-filters-label { color: var(--muted); font-size: 12px; }
.active-filter { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border: 1.5px solid #a9e3d0; border-radius: 999px; color: var(--mint-ink); background: #fff; box-shadow: var(--shadow-control); cursor: pointer; font-size: 12px; }
.active-filter span { color: var(--muted); font-size: 15px; line-height: 1; }
.active-filter:hover { border-color: var(--mint); background: var(--mint-chip); color: var(--ink); }
```

styles.css:35（`.clear-filters`）取代為：

```css
.clear-filters { min-height: 48px; padding: 0 18px; border: 1.5px dashed var(--orange); border-radius: 999px; color: var(--orange); background: #fff; box-shadow: var(--shadow-control); cursor: pointer; font-weight: 700; }
.clear-filters:hover { color: #b56f28; border-color: #b56f28; background: #fff6ec; }
```

- [ ] **Step 5: 場效彈窗的 EX 選項對比**

styles.css:209-211 三行取代为（白底下亮黃字看不清，改深金字淡金底；色點 fx-ex-dot 保留飽和金）：

```css
.fieldeffect-select .fx-ex-dot { background: #f2c94c; box-shadow: 0 0 6px rgba(242,201,76,.45); }
.fieldeffect-select .fx-ex-option { color: #8a6d00; }
.fieldeffect-select .fx-ex-option.is-selected { border-color: #d8b53a; background: #fdf6df; }
```

- [ ] **Step 6: 構建截圖（含彈窗開啟態）**

```bash
npm test && npm run build
```

重啟/沿用 8761 靜態服務，headless 截圖 `/tmp/task3.png`。彈窗是點擊展開，headless 無法直接點；截圖後以 Read 檢查「全部篩選收起態」：

1. 搜尋框白底牌面、9 個下拉白底圓角、清除鈕白底橘虛線膠囊；
2. 奶油底上所有文字清楚（延續可讀性要求）；
3. 工具列高度一致、沒有殘留深色塊或深綠彈窗底色。

彈窗開啟態與多選晶片：請使用者在瀏覽器實際點開「屬性」與「場效」下拉確認色點／EX 行可讀（記入 Task 6 的最終人工驗收，本步先自檢靜態）。

- [ ] **Step 7: Commit**

```bash
git add styles.css
git commit -m "feat(theme): 篩選工具列與彈窗白色膠囊化、移除遺死樣式"
```

---

### Task 4: 拍組貼紙卡片與全套徽章

這是最大的一塊，按「卡體 → 圖區屬性淡色 → 徽章 → 死規則清理」四步做。

**Files:**
- Modify: `styles.css:37-38`（pair card/art/meta/name/ex-toggle）
- Modify: `styles.css:46-70`（badges、role、屬性飽和色表）
- Modify: `styles.css:71`（pair-total 字體）
- Modify: `styles.css:162-177`（badges 覆寫規則）
- Modify: `styles.css:178-199`（field/formation/chip-lv）
- Modify: `styles.css:213-257`（卡片屬性覆寫、--pair-color、image-missing）

**Interfaces:**
- 屬性淡色表完全照 spec §5；卡體 class 結構不變（app.js:119）。

- [ ] **Step 1: 卡體、meta、名稱**

styles.css:37 整行取代為：

```css
.content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 13px; }
.pair-card, .event-card { border: 1.5px solid #e4f0ea; border-radius: 18px; background: #fff; box-shadow: var(--shadow-card); overflow: hidden; transition: border-color .2s, transform .2s, box-shadow .2s; }
.pair-card:hover, .event-card:hover { border-color: var(--mint); transform: translateY(-3px); box-shadow: 0 10px 22px rgba(31,74,61,.14); }
.pair-card a { display: flex; flex-direction: column; height: 100%; color: var(--ink); text-decoration: none; }
.pair-art { position: relative; aspect-ratio: 1; display: grid; place-items: center; background: #f0f6f3; overflow: hidden; }
.pair-art img { width: 128px; max-width: 82%; height: auto; aspect-ratio: 1; object-fit: contain; }
.pair-art .missing { color: #b7cbc4; font: 700 28px 'Zen Maru Gothic', 'PingFang TC', sans-serif; }
.pair-meta { padding: 13px 14px 15px; border-top: 1px solid var(--line); background: #fff; }
.pair-category { color: var(--orange); font-size: 11px; }
.pair-name { display: block; margin-top: 7px; font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; font-size: 14px; line-height: 1.55; font-weight: 700; }
```

styles.css:38（`.ex-toggle`）取代為：

```css
.ex-toggle { position: absolute; right: 8px; bottom: 8px; z-index: 2; padding: 5px 10px; border: 1.5px solid #a9e3d0; border-radius: 999px; color: var(--mint-ink); background: rgba(255,255,255,.92); cursor: pointer; font-size: 10px; font-weight: 700; box-shadow: var(--shadow-control); }
.ex-toggle:hover { background: var(--mint-chip); }
.ex-toggle.is-ex { color: #8a4b12; background: var(--orange-soft); border-color: #f3c99b; }
.ex-toggle:disabled { color: #a9bbb5; background: #f1f5f3; border-color: var(--line); cursor: not-allowed; }
```

- [ ] **Step 2: 缺圖斜紋淺化**

styles.css:237（`.image-missing`）取代为：

```css
.image-missing { display: grid; place-items: center; width: 100%; height: 100%; min-height: 80px; color: var(--muted); font-size: 12px; background: repeating-linear-gradient(-45deg, #eef4f1, #eef4f1 8px, #e2ede8 8px, #e2ede8 16px); }
```

圖區按第一屬性染淡色的 18 條規則統一在 Step 5 的尾端區塊寫入。

- [ ] **Step 3: 徽章基礎與分類/角色/限定**

styles.css:46-50 五行取代为：

```css
.pair-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.pair-role, .attribute-chip { display: inline-block; padding: 2px 9px; border: 1px solid transparent; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 1.6; white-space: nowrap; }
.pair-role { color: #176b52; border-color: #b1e7d3; background: #d6f4e8; }
.pair-role.physical { color: #274b80; border-color: #bcd6f7; background: #dbeaff; }
.attribute-chip { border-color: transparent; }
```

styles.css:71（`.pair-total`）取代為：

```css
.pair-total { float: right; color: var(--muted); font: 500 11px 'Noto Sans TC', 'PingFang TC', sans-serif; }
```

styles.css:162-177 整段（從 `.pair-badges .pair-category {` 到 `.pair-badges .attribute-chip { border-color: rgba(255,255,255,.62); }`）取代為：

```css
.pair-badges { gap: 6px; }
.pair-badges .pair-category,
.pair-badges .pair-role,
.pair-badges .attribute-chip,
.pair-badges .pair-limited-tag,
.pair-badges .field-chip,
.pair-badges .formation-chip { border-radius: 999px; font-weight: 700; line-height: 1.45; white-space: nowrap; }
.pair-badges .pair-category { display: inline-block; padding: 2px 9px; border: 1px solid #f3d9bd; color: #8a4b12; background: var(--orange-soft); font-size: 10px; }
.pair-badges .pair-limited-tag { display: inline-block; padding: 2px 9px; border: 1px solid #f6c9dd; border-radius: 999px; color: #9c3f68; background: #ffe0ee; font-size: 10px; font-weight: 700; line-height: 1.45; white-space: nowrap; }
.pair-badges .pair-role { padding: 2px 9px; }
.pair-badges .pair-role[class] { box-shadow: none; }
```

- [ ] **Step 4: 18 屬性淡色徽章（取代 53-70 的裸 .attribute-N 飽和色）**

styles.css:51-70（註解＋`.attribute-0`…`.attribute-17`）整段取代為下列規則——晶片（含 zone 場效上的 attribute-N）用淡底深字，裸 `.attribute-N` 不再自帶底色，避免染到整張 article 與彈窗 option：

```css
/* 屬性色：卡片徽章與 zone 場效晶片用淡底深字；飽和原色只留給篩選彈窗色點（Task 3 ::before）。*/
.pair-badges .attribute-chip.attribute-0, .pair-badges .field-chip.attribute-0 { background: #eceff0; color: #4a565a; }
.pair-badges .attribute-chip.attribute-1, .pair-badges .field-chip.attribute-1 { background: #ffe0de; color: #a52b2e; }
.pair-badges .attribute-chip.attribute-2, .pair-badges .field-chip.attribute-2 { background: #dcf3fb; color: #176b8a; }
.pair-badges .attribute-chip.attribute-3, .pair-badges .field-chip.attribute-3 { background: #fdf3c8; color: #7a5b00; }
.pair-badges .attribute-chip.attribute-4, .pair-badges .field-chip.attribute-4 { background: #dff3e2; color: #206b2c; }
.pair-badges .attribute-chip.attribute-5, .pair-badges .field-chip.attribute-5 { background: #e2f4f4; color: #357074; }
.pair-badges .attribute-chip.attribute-6, .pair-badges .field-chip.attribute-6 { background: #ffe8db; color: #9c4e1f; }
.pair-badges .attribute-chip.attribute-7, .pair-badges .field-chip.attribute-7 { background: #efe3f7; color: #5e3478; }
.pair-badges .attribute-chip.attribute-8, .pair-badges .field-chip.attribute-8 { background: #f3e6dd; color: #72402a; }
.pair-badges .attribute-chip.attribute-9, .pair-badges .field-chip.attribute-9 { background: #dbe4fb; color: #2f4fa8; }
.pair-badges .attribute-chip.attribute-10, .pair-badges .field-chip.attribute-10 { background: #fbdfea; color: #9c2f5b; }
.pair-badges .attribute-chip.attribute-11, .pair-badges .field-chip.attribute-11 { background: #eef5d9; color: #5f751f; }
.pair-badges .attribute-chip.attribute-12, .pair-badges .field-chip.attribute-12 { background: #ece6de; color: #5f4f3f; }
.pair-badges .attribute-chip.attribute-13, .pair-badges .field-chip.attribute-13 { background: #f2e4f0; color: #7a4f75; }
.pair-badges .attribute-chip.attribute-14, .pair-badges .field-chip.attribute-14 { background: #d6eef6; color: #0c5f76; }
.pair-badges .attribute-chip.attribute-15, .pair-badges .field-chip.attribute-15 { background: #e4e2ea; color: #37344a; }
.pair-badges .attribute-chip.attribute-16, .pair-badges .field-chip.attribute-16 { background: #e7eaf0; color: #515a6e; }
.pair-badges .attribute-chip.attribute-17, .pair-badges .field-chip.attribute-17 { background: #ffe9f2; color: #b35178; }
.pair-badges .attribute-chip, .pair-badges .field-chip[class*="attribute-"] { border-color: transparent; }
```

**重要：** 舊的裸 `.attribute-N { background: 飽和色 }` 被上面取代後，場效彈窗的 zone 色點（app.js:179 產出 `<i class="fx-dot attribute-N">`，不是 `::before`）會跟著掉色。必須在同一區塊緊接著追加這 18 條飽和規則：

```css
/* 場效篩選彈窗：zone 分類的色點維持飽和原色（與屬性彈窗 ::before 同一套色票）。*/
.fieldeffect-select .fx-dot.attribute-0 { background: #969493; }
.fieldeffect-select .fx-dot.attribute-1 { background: #bd3437; }
.fieldeffect-select .fx-dot.attribute-2 { background: #55b8e2; }
.fieldeffect-select .fx-dot.attribute-3 { background: #dcb40a; }
.fieldeffect-select .fx-dot.attribute-4 { background: #459e4e; }
.fieldeffect-select .fx-dot.attribute-5 { background: #94c9cb; }
.fieldeffect-select .fx-dot.attribute-6 { background: #d57741; }
.fieldeffect-select .fx-dot.attribute-7 { background: #784a91; }
.fieldeffect-select .fx-dot.attribute-8 { background: #975939; }
.fieldeffect-select .fx-dot.attribute-9 { background: #4971dd; }
.fieldeffect-select .fx-dot.attribute-10 { background: #c34b78; }
.fieldeffect-select .fx-dot.attribute-11 { background: #9cb558; }
.fieldeffect-select .fx-dot.attribute-12 { background: #85725f; }
.fieldeffect-select .fx-dot.attribute-13 { background: #a0739b; }
.fieldeffect-select .fx-dot.attribute-14 { background: #1284a1; }
.fieldeffect-select .fx-dot.attribute-15 { background: #4a4759; }
.fieldeffect-select .fx-dot.attribute-16 { background: #7f889c; }
.fieldeffect-select .fx-dot.attribute-17 { background: #ed9bb8; }
```

- [ ] **Step 5: 場效/鬥陣/超覺醒徽章與尾端死規則清理**

styles.css:180（`.pair-badges .field-chip` 基礎）取代为：

```css
.pair-badges .field-chip { display: inline-block; padding: 2px 9px; border: 1px solid transparent; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 1.45; white-space: nowrap; }
```

styles.css:181-187（七個天氣/場地飽和色，**這些 class 也用在彈窗色點 `.fx-dot`，不能直接改裸規則**）後面追加淡色晶片版——把 181-187 保留原樣，新增以下覆寫：

```css
.pair-badges .field-chip.field-weather-sun { background: #fdf0c8; color: #7a5b00; }
.pair-badges .field-chip.field-weather-rain { background: #dcecfb; color: #1f5a8c; }
.pair-badges .field-chip.field-weather-sand { background: #f3e6dd; color: #7a4f2e; }
.pair-badges .field-chip.field-weather-hail { background: #e2f4f4; color: #357074; }
.pair-badges .field-chip.field-terrain-electric { background: #fdf3c8; color: #8a6d00; }
.pair-badges .field-chip.field-terrain-grassy { background: #dff3e2; color: #2f7a3a; }
.pair-badges .field-chip.field-terrain-psychic { background: #fbdfea; color: #9c2f5b; }
```

styles.css:188（is-ex 金邊）取代為：

```css
.pair-badges .field-chip.is-ex { border-color: #e8cf7a; background: #fdf0c8; color: #7a5b00; }
```

styles.css:191-195（formation 基礎＋四色）取代為：

```css
.pair-badges .formation-chip { position: relative; display: inline-block; padding: 2px 9px; border: 1px solid transparent; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 1.45; white-space: nowrap; }
.formation-physical { background: #ffe0de; color: #a52b2e; }
.formation-special { background: #dbeaff; color: #274b80; }
.formation-defense { background: #d6f4e8; color: #176b52; }
.formation-mixed { background: #ece3f7; color: #5e3478; }
```

注意 formation 色 class 只出現在卡片晶片，沒有彈窗色點共用，改裸規則安全。

styles.css:199（chip-lv/chip-sa）中的深色邊與黑影替換，整行改為：

```css
.chip-lv, .chip-sa { position: absolute; top: -7px; right: -7px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: #ffe08a; color: #6b4d00; border: 1px solid #e8cf7a; font-size: 9px; font-weight: 800; font-style: normal; line-height: 12px; text-align: center; box-shadow: 0 1px 2px rgba(31,74,61,.2); }
```

styles.css:213-257（`.pair-badges .attribute-0…` 邊色覆寫、`.pair-card[class*="attribute-"]` 深色強制塊、18 條 `--pair-color`）**整段刪除**，並在檔案尾端追加本 Task 的統一區塊（含 Step 2 的 18 條 `.pair-art` 染色）：

```css
/* 粉彩主題：拍組卡圖區依第一屬性染淡色（spec §5），其餘區域保持白卡。 */
.pair-card[class*="attribute-"] { position: relative; overflow: hidden; background: #fff; }
.pair-card[class*="attribute-"] > a { position: relative; z-index: 1; }
.pair-card[class*="attribute-"] .pair-meta { background: #fff; }
.pair-card.attribute-0 .pair-art { background: #eceff0; }
.pair-card.attribute-1 .pair-art { background: #ffe0de; }
.pair-card.attribute-2 .pair-art { background: #dcf3fb; }
.pair-card.attribute-3 .pair-art { background: #fdf3c8; }
.pair-card.attribute-4 .pair-art { background: #dff3e2; }
.pair-card.attribute-5 .pair-art { background: #e2f4f4; }
.pair-card.attribute-6 .pair-art { background: #ffe8db; }
.pair-card.attribute-7 .pair-art { background: #efe3f7; }
.pair-card.attribute-8 .pair-art { background: #f3e6dd; }
.pair-card.attribute-9 .pair-art { background: #dbe4fb; }
.pair-card.attribute-10 .pair-art { background: #fbdfea; }
.pair-card.attribute-11 .pair-art { background: #eef5d9; }
.pair-card.attribute-12 .pair-art { background: #ece6de; }
.pair-card.attribute-13 .pair-art { background: #f2e4f0; }
.pair-card.attribute-14 .pair-art { background: #d6eef6; }
.pair-card.attribute-15 .pair-art { background: #e4e2ea; }
.pair-card.attribute-16 .pair-art { background: #e7eaf0; }
.pair-card.attribute-17 .pair-art { background: #ffe9f2; }
```

- [ ] **Step 6: rank 徽章保留原樣，只驗證不修改**

styles.css:76-87 的七個 `.pair-rank`（彩虹/黑金/紫/黃/藍/紅/灰）**一個都不改**——它們是白卡上的飽和徽章。Step 7 截圖逐級確認。

- [ ] **Step 7: 構建截圖，逐色檢查**

```bash
npm test && npm run build
```

headless 截圖 `/tmp/task4.png`（1280 寬），Read 檢查：
1. 卡片白底牌紙感：18px 圓角、柔影、hover 前無深色漸層；
2. 圖區淡色依屬性不同（第一列通常涵蓋 2-3 色），精靈圖 128px 清楚；
3. 一排徽章：分類橙、物理藍/特殊薄荷、限定粉、屬性淡底深字、rank 七種可辨；
4. EX 切換鈕白底薄荷邊（有 EX 的卡）；缺圖卡是淺斜紋；
5. 往下滾動截第二張圖（window 高度拉到 2200）確認場效/鬥陣晶片、超覺醒「超」小金標可讀。

若有特定等級/場效在首屏沒出現，請使用者在瀏覽器用篩選調出，計入 Task 6 人工驗收。

- [ ] **Step 8: Commit**

```bash
git add styles.css
git commit -m "feat(theme): 拍組白色貼紙卡、屬性淡色圖區與全套淡底徽章"
```

---

### Task 5: 活動卡、分頁、空狀態、footer

**Files:**
- Modify: `styles.css:36`（section-heading/result-summary）
- Modify: `styles.css:39`（event-card 系列）
- Modify: `styles.css:40`（empty-state）
- Modify: `styles.css:41`（pagination）
- Modify: `styles.css` 尾端（新增 footer 規則）

- [ ] **Step 1: 區塊標題列**

styles.css:36 取代為：

```css
.section-heading { display: flex; justify-content: space-between; align-items: end; margin-bottom: 22px; }
.result-summary { color: var(--muted); font-size: 13px; margin: 0; }
```

（內容不變，僅確認 token 翻淺後顏色正確——這行外觀幾乎相同，這步是錨點完整性檢查，若與現況逐字相同可跳過 edit。）

- [ ] **Step 2: 活動卡**

styles.css:39 整行取代為：

```css
.event-card { grid-column: span 2; display: flex; flex-direction: column; min-height: 0; }
.event-visual { height: clamp(170px, 20vw, 250px); display: grid; place-items: center; overflow: hidden; background: #f0f6f3; padding: 10px; }
.event-card img { display: block; width: 100%; height: 100%; object-fit: contain; }
.event-art-empty { width: 100%; height: 100%; min-height: 150px; background: repeating-linear-gradient(-45deg, #eef4f1, #eef4f1 8px, #e2ede8 8px, #e2ede8 16px); }
.event-info { padding: 19px 20px; background: #fff; }
.event-dates { color: var(--mint-ink); font: 700 11px 'Zen Maru Gothic', 'PingFang TC', sans-serif; letter-spacing: .04em; }
.event-status { float: right; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; }
.event-status.active { color: #176b52; background: #d6f4e8; }
.event-status.upcoming { color: #8a4b12; background: #ffe6cc; }
.event-status.ended { color: var(--muted); background: #fff; border: 1px solid var(--line); }
.event-title { font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; font-size: 18px; line-height: 1.45; margin: 19px 0 9px; }
.event-desc { color: var(--muted); font-size: 13px; line-height: 1.7; margin: 0; }
```

注意 `.event-status` 基礎行不再給色（全部由三態 class 給色），app.js:121 產出的 status 值就是 `active/upcoming/ended`，對得上。

- [ ] **Step 3: 空狀態**

styles.css:40 取代为：

```css
.empty-state { margin: 20px 0; padding: 60px 20px; text-align: center; border: 1.5px dashed var(--line); border-radius: 18px; background: #fff; box-shadow: var(--shadow-card); color: var(--muted); }
.empty-state strong, .empty-state span { display: block; }
.empty-state strong { color: var(--ink); margin-bottom: 8px; font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; font-size: 17px; }
.empty-state strong::after { content: ' ✿'; color: var(--mint); }
```

- [ ] **Step 4: 分頁**

styles.css:41 取代为：

```css
.pagination { display: flex; justify-content: center; align-items: center; gap: 7px; margin: 38px 0 62px; }
.page-button { min-width: 36px; height: 36px; border: 1.5px solid var(--line); border-radius: 10px; color: var(--muted); background: #fff; box-shadow: var(--shadow-control); cursor: pointer; font-family: 'Zen Maru Gothic', 'PingFang TC', sans-serif; font-weight: 700; transition: border-color .2s, background .2s; }
.page-button:hover { color: var(--mint-ink); border-color: var(--mint); }
.page-button.is-active { color: var(--mint-ink); background: var(--mint-chip); border-color: var(--mint); }
.page-button:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }
.page-ellipsis { width: 18px; color: var(--muted); text-align: center; }
```

- [ ] **Step 5: footer（原本無樣式）**

在 styles.css 尾端 append：

```css
footer { padding: 4px 0 44px; color: var(--muted); font-size: 12px; text-align: center; }
```

- [ ] **Step 6: 構建截圖**

```bash
npm test && npm run build
```

活動 tab 與空狀態需要互動才能出現，headless 靜態截圖只能驗證分頁鈕與整體一致性；活動卡/狀態膠囊/空狀態列入 Task 6 人工點擊驗收。本步截圖 `/tmp/task5.png` 確認分頁鈕白底圓角、active 薄荷淡底深字，footer 灰字置中。

- [ ] **Step 7: Commit**

```bash
git add styles.css
git commit -m "feat(theme): 活動卡、分頁鈕、空狀態與 footer 淺色化"
```

---

### Task 6: 響應式微調、離線字體驗證、整體人工驗收

**Files:**
- Modify: `styles.css:113-160`（620px/420px 斷點追加）
- 可能微調：hero mask 參數（若截圖發現窄屏硬邊）

- [ ] **Step 1: 窄屏 hero 與卡片微調**

在 styles.css 的 `@media (max-width: 620px)` 區塊（約 113-147 行）內追加兩行：

```css
  .hero-mark { border-radius: 14px; }
  .select-box, .clear-filters { box-shadow: none; }
```

在 `@media (max-width: 420px)` 區塊（約 149-160 行）內追加：

```css
  .pair-card, .event-card { border-radius: 14px; box-shadow: 0 3px 8px rgba(31,74,61,.08); }
  .event-card { grid-column: span 2; }
```

（`event-card span 2` 該區塊已有則不重複加。）

- [ ] **Step 2: 手機寬截圖**

```bash
npm run build
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --window-size=390,2400 --screenshot=/tmp/task6-mobile.png "http://localhost:8761/" 2>/dev/null
```

Read 檢查：hero 圖無硬邊、篩選兩列整齊、卡片 2 欄、徽章不擠壓、沒有橫向溢出。

桌面再截一張 `/tmp/task6-desktop.png`（1280×2200）對照 spec §9 桌面清單逐項打勾。

- [ ] **Step 3: 離線字體驗證（擋掉 Google 網域）**

把 Google Fonts CDN 指向 localhost，Noto 會回退系統字，但自託管的 Zen Maru 應正常：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --host-resolver-rules="MAP fonts.googleapis.com 127.0.0.1:1, MAP fonts.gstatic.com 127.0.0.1:1" --window-size=1280,900 --screenshot=/tmp/task6-offline.png "http://localhost:8761/" 2>/dev/null
```

Read `/tmp/task6-offline.png`：標題「帕希歐資料庫」仍必須是圓體；內文可為 PingFang。若標題不圓，檢查 dist/assets/fonts/zen-maru 的 css 路徑與 woff2 檔名。

- [ ] **Step 4: 無 console 錯誤與互動人工驗收**

瀏覽器打開 `http://localhost:8761/`（請使用者操作或由執行者開 Chrome 非 headless），逐項確認並回報：

1. 打開「屬性」彈窗：3×6 格、每項前飽和色點、選中薄荷淡底；
2. 打開「場效」彈窗：色點飽和、EX 行深金字可讀、分組標題清楚；
3. 選幾個篩選 → active-filters 膠囊出現、可單獨 × 移除、清除篩選鈕作用正常；
4. 卡片 EX 鈕點擊切換頭像；卡片點進石盤頁（detail 頁本來就獨立，這裡只確認連結可達）；
5. 切「活動日誌」tab：活動白卡、進行中薄荷膠囊/即將橙/已結束灰；
6. 無結果搜尋（如 `zzzz`）：空狀態白卡虛邊＋✿；
7. 分頁點擊換頁、URL 無報錯，DevTools console 無紅字；
8. 全站巡遊：含七種 rank、場效 is-ex 金標、鬥陣四色、超覺醒「超」標的實卡各看到至少一次。

發現問題就回 Task 對應規則修，修完重跑該 Task 的截圖步驟。

- [ ] **Step 5: 最終回歸與 commit**

```bash
npm test
npm run build
git add styles.css
git commit -m "fix(theme): 窄屏圓角陰影微調" || echo "無差異則跳过"
```

- [ ] **Step 6: 收尾**

停掉背景靜態服務（8761）；告訴使用者主題上線方式：`npm run build` 後部署 `dist/`，字體隨 assets/ 一起帶上，無新增外部依賴。

---

## Self-Review 紀錄

- Spec §2 token：Task 2 Step 1 全數落地；§2.2 字體/圓角/✿ 限制散落 Task 2-5 並以「全站唯一 ✿ 在 hero-copy、空狀態那顆為 spec §4 表格明示」為準（兩顆不違反 §2.2——§2.2 限定「標題綴飾」，空狀態屬組件內點綴）。
- Spec §3 背景：Task 2 Step 2。
- Spec §4 表格逐列：hero/tabs（T2）、search/select/menu/clear/active-filter（T3）、pair-card/art/ex/rank 保留（T4）、category/role/limited/attribute/field/formation（T4）、event/dates/status（T5）、page/empty/footer（T5）。
- Spec §5：T4 Step 4 晶片 18 色、Step 2/5 圖區 18 色、T3 Step 3 彈窗色點保留飽和。
- Spec §6 字體：T1。
- Spec §7 響應式：T6。
- Spec §9 驗收：T2-T5 各自截圖閘＋T6 桌面/手機/離線/互動總驗收。
- 無 TBD/TODO；所有 CSS 均給完整宣告；app.js/build-data.mjs/overrides 零改動已在 Global Constraints 鎖死。
