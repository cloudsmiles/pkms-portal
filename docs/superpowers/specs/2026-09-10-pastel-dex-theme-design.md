# 帕希歐資料庫視覺重塑：粉彩圖鑑主題

日期：2026-09-10
狀態：待使用者審查

## 1. 背景與目標

入口網站目前是「深色攝影寫實」風格：全屏 salina 照片壓暗當底、深色半透卡片、細邊框、直角偏多。功能完整但視覺辨識度低，使用者希望「更專業、更可愛，更像一個主題網站」。

本次只做**視覺主題重塑**，不變動任何資料結構、篩選邏輯與互動行為。

已確認的方向（瀏覽器視覺稿逐輪比對後選定）：

1. **主題：粉彩圖鑑**——奶油薄荷淺色底、白色圓角貼紙卡片、柔和膠囊標籤。
2. **字體：禪圓黑體 Zen Maru Gothic** 用於標題、分頁、卡片名稱等展示文字；內文與數字維持 Noto Sans TC。**字體自託管**，離線可用。
3. **背景：salina 保留**，但從「全屏壓暗底圖」改為「只出現在 hero 主視覺區」，清晰圖置中、邊緣虛化（徑向漸層）、底部線性漸層融入頁面奶油底。
4. **卡片：整齊貼紙**——厚白邊、柔和陰影、彩色圖區、膠囊標籤，網格對齊**不旋轉**；可愛感來自形狀與配色，不靠歪斜。

非目標：不新增特輯/首頁輪播等編輯部功能（那是另一個被否決的方向 C）；不重寫篩選元件；不處理 detail 石盤頁（`overrides/detail-style.css` 為獨立範圍，本次不動）。

## 2. 設計 Token

### 2.1 色板（取代 styles.css:3 的 `:root` 變數）

| Token | 新值 | 用途 |
|---|---|---|
| `--bg` | `#f4faf7` | 頁面奶油薄荷底 |
| `--ink` | `#23302d` | 主文字（深墨綠，不用純黑） |
| `--muted` | `#6d857e` | 次要文字 |
| `--line` | `#dce9e3` | 預設描邊、分隔線 |
| `--panel` | `#ffffff` | 卡片、選單底色 |
| `--mint` | `#2fae86` | 主色：連結、強調、active（淺底上需比舊色深） |
| `--mint-ink` | `#176b52` | 薄荷底色上的文字 |
| `--mint-soft` | `#d9f5ea` | 大面積薄荷淡底（hero 漸層、chip 底） |
| `--mint-chip` | `#e7f9f2` | 選中態膠囊底 |
| `--orange` | `#d98a3c` | 輔助強調（淺底加深版） |
| `--orange-soft` | `#ffe6cc` | 橙色膠囊底 |
| `--danger` | `#e25c54` | 移除、警示 |

陰影統一為柔綠調：
- 卡片：`0 6px 16px rgba(31,74,61,.10)`
- 小控件（搜尋框、膠囊下拉）：`0 3px 8px rgba(31,74,61,.06)`
- 彈出選單：`0 16px 32px rgba(31,74,61,.16)`

### 2.2 字形與形狀

- 展示字級（h1、h2、`.tab`、`.hero-mark`、`.pair-name`、`.event-title`、`.event-dates`、分頁按鈕、區塊 kicker）：`'Zen Maru Gothic', 'PingFang TC', sans-serif`，字重 700/900。
- 內文、數字、表單：維持 `'Noto Sans TC', 'PingFang TC', sans-serif`。
- 英文 kicker、tab 計數、活動日期目前用 Space Grotesk（styles.css:15、22、39）；**一併改用 Zen Maru Gothic**（大寫＋字距 `.14em`），移除 Space Grotesk 依賴，字種收斂為兩套。
- 圓體字形飽滿，h1/h2 現有的 `letter-spacing:-.06em` 取消改為 `0`，避免圓體擠字。
- 圓角尺度：控件 12–14px；卡片 18px；膠囊（chip／篩選／分頁鈕）`999px`；logo 貼紙 10px 且 `rotate(-6deg)`。
- 可愛點綴僅限：`.hero-copy` 標語結尾加一顆 `✿`（全站唯一，section 標題與卡片不加）、logo 傾斜、卡片 rank 彩虹膠囊；**不加**紙膠帶、隨機旋轉、滿版圖示。

## 3. 背景圖處理（hero 限定）

現狀兩層 `body::before/::after` 是 fixed 全屏，長列表永遠襯在圖上——淺色主題會造成持續干擾。改為**把背景層掛到 `.hero` 上**，圖片只存在於主視覺區，隨頁面捲動離開；其餘區域為純 `--bg`。

`.hero` 由現有三列 grid（mark／文案／note）保留結構，下設三個絕對定位層：

1. `.hero::before` 模糊層：salina `cover`、`blur(26px)`、`opacity:.5`、不壓暗；雙層 mask 交集——`radial-gradient(120% 100% at 50% 40%, #000 55%, transparent 85%)` 讓四邊（尤其左右直邊）淡出，再乘上 `linear-gradient(180deg,#000 50%,transparent 90%)` 讓底部更快融入頁面。
2. `.hero::after` 清晰層：salina `contain` 置中偏右；`radial-gradient(68% 82% at 56% 40%, #000 46%, rgba(0,0,0,.5) 64%, transparent 82%)` 讓邊緣虛化；再疊一層向 `--bg` 的底部漸層面罩。
3. 文字層維持正常文件流，色用 `--ink`／`--muted`；文案座落在左側，若局部壓到清晰圖，加一塊白色柔光（`rgba(255,255,255,.55)` 模糊圓）護對比，**禁止整圖壓暗**。文字對比目標 ≥ 4.5:1，以實機截圖驗收。

`.hero` 高度由 `min-height:260px` 改為 `min-height:240px`；底部舊的 1px 分隔線改為 2px `--mint-soft` 線，與 tab 列銜接。

## 4. 元件變更清單

只列視覺變更；DOM 結構與 class 名原則上不動，app.js 模板不改正確性邏輯。

| 元件 | 現狀（深色） | 新樣貌 |
|---|---|---|
| `.hero-mark` | 薄荷描邊方塊 | 薄荷漸層圓角貼紙、白字、維持傾斜（微調 -6deg） |
| `.eyebrow` / h1 / h2 | 白字、緊字距 | Zen Maru、墨綠；h1 加白色文字柔影 `0 2px 0 rgba(255,255,255,.7)` |
| `.hero-note` | 灰字＋光點 | 白色半透膠囊（`rgba(255,255,255,.85)`＋`--line` 邊），光點改 `--mint` 不發光 |
| `.tab` | 灰字、底部 2px 線 | Zen Maru；active 墨綠字＋3px `--mint` 底線；計數 chip 改淡薄荷底深字 |
| `.search-box` | 深色半透 | 白底牌面：1.5px `--line`、圓角 14px、小柔影；focus 薄荷邊＋淡薄荷光環 |
| `.select-box`（9 個下拉） | 前導修改上的深色底 | 改為**白底**＋1.5px `--line` 圓角 14px；`.is-active` 為 `--mint-chip` 底＋薄荷邊＋`--mint-ink` 字 |
| `.select-menu` | 深綠實底 | 白底、`--line` 邊、柔綠陰影；option hover/selected 淡薄荷底＋薄荷邊 |
| `.clear-filters` | 深色底 | 白底＋`--orange` 虛線邊＋橙色字；hover 淡橙底 |
| `.active-filter` | 薄荷描邊深底晶片 | 白底薄荷邊膠囊，× 為 muted，hover 轉實薄荷底 |
| `.pair-card` | 深色漸層直角卡 | 白卡、圓角 18px、厚白邊感（`outline:1.5px #e4f0ea`）、柔影；hover `translateY(-3px)`＋薄荷邊（保留） |
| `.pair-art` | 深色 radial 底 | 依屬性給淡色底（見 §5）；無屬性資料時用淡薄荷 radial；圖片維持 128px contain |
| `.ex-toggle` | 薄荷實心圓鈕 | 白底薄荷邊小膠囊；`.is-ex` 改淡橙底橙字；disabled 淡灰 |
| `.pair-rank`（七種等級） | 深色底實心徽章 | **全數保留現色**（彩虹/黑金/紫/黃/藍/紅/灰本就是飽和徽章，白卡上成立），逐級在白卡截圖驗對比 |
| `.pair-category` | 橙字 | 淡橙底 `#ffe6cc`／字 `#8a4b12` |
| `.pair-role`（物理/特殊） | 橙／藍實心 | 物理：底 `#dbeaff`／字 `#274b80`；特殊：底 `#d6f4e8`／字 `#176b52` |
| `.pair-limited-tag` | 薄荷實心 | 淡粉底 `#ffe0ee`／字 `#9c3f68`，讓限定徽章在一排淡色中仍突出 |
| `.attribute-chip`（17 屬性＋一般） | 飽和底白字 | 各屬性專用淡底深字（見 §5 映射表） |
| `.field-chip`／`.formation-chip` | 深色描邊/實心 | 淡底深字膠囊：物理 `#ffe0de/#a52b2e`、特殊 `#dbeaff/#274b80`、防守 `#d6f4e8/#176b52`、混合 `#ece3f7/#5e3478`；`.is-ex` 淡金底 `#fdf0c8`／字 `#7a5b00` |
| `.event-card` | 深色卡跨 2 欄 | 同 pair-card 貼紙規格；`.event-visual` 底改 `#f0f6f3`；`.event-art-empty` 斜紋改淺色兩階 |
| `.event-dates` / `.event-status` | 薄荷/橙 | 日期 `--mint-ink`＋Zen Maru；狀態皆膠囊：進行中 `#d6f4e8/#176b52`、即將 `#ffe6cc/#8a4b12`、已結束白底灰邊灰字 |
| `.page-button` | 透明方鈕 | 白底圓角卡片鈕；active 為 `--mint-chip` 底＋薄荷邊＋`--mint-ink` 深字（對比 >7:1） |
| `.empty-state` | 深色虛線框 | 白卡虛邊區塊，strong 用 Zen Maru，加 `✿` 點綴 |
| `footer` | 灰字 | muted 小字置中，不加分隔塊 |

## 5. 語義色淡底化規則

17 個屬性與分類徽章在深色版是「飽和底＋白字」（styles.css:53–70）。淺色版統一規則：**同一色相，底取約 12–18% 飽和淡色，字取該色相的深色**，配 1px 同色相 30% 邊。完整映射（編號沿用現有 `.attribute-N`）：

| N | 屬性 | 淡底 | 深字 |
|---|---|---|---|
| 0 | 一般 | `#eceff0` | `#4a565a` |
| 1 | 火 | `#ffe0de` | `#a52b2e` |
| 2 | 水 | `#dcf3fb` | `#176b8a` |
| 3 | 電 | `#fdf3c8` | `#7a5b00` |
| 4 | 草 | `#dff3e2` | `#206b2c` |
| 5 | 冰 | `#e2f4f4` | `#357074` |
| 6 | 格鬥 | `#ffe8db` | `#9c4e1f` |
| 7 | 毒 | `#efe3f7` | `#5e3478` |
| 8 | 地面 | `#f3e6dd` | `#72402a` |
| 9 | 飛行 | `#dbe4fb` | `#2f4fa8` |
| 10 | 超能力 | `#fbdfea` | `#9c2f5b` |
| 11 | 蟲 | `#eef5d9` | `#5f751f` |
| 12 | 岩石 | `#ece6de` | `#5f4f3f` |
| 13 | 幽靈 | `#f2e4f0` | `#7a4f75` |
| 14 | 龍 | `#d6eef6` | `#0c5f76` |
| 15 | 惡 | `#e4e2ea` | `#37344a` |
| 16 | 鋼 | `#e7eaf0` | `#515a6e` |
| 17 | 妖精 | `#ffe9f2` | `#b35178` |

用途區分：卡片上的 `.attribute-chip` 用淡底深字；篩選彈窗裡的小色點（`::before` 圓點、`.fx-dot`）**維持飽和原色**，白底下小面積色點識別度最好。`.pair-art` 背景改用屬性淡底（取代深 radial）；一張卡多屬性時取第一屬性。

## 6. 字體自託管

- 新增 `assets/fonts/zen-maru/`：透過 Google Fonts CSS API（帶現代瀏覽器 UA）取得 **Zen Maru Gothic 500/700/900** 的 woff2 unicode-range 分片與對應 `@font-face`，存為 `assets/fonts/zen-maru/zen-maru.css` + 分片 woff2。
- 在 `index.html` 以 `<link rel="stylesheet" href="./assets/fonts/zen-maru/zen-maru.css">` 引入；font-family 名保持 `'Zen Maru Gothic'`。
- Noto Sans TC 維持既有 Google Fonts `@import`（現況即 CDN，離線時 macOS/iOS 回退 PingFang TC，不影響版面）；本次不擴大為雙字體自託管。
- `scripts/build-data.mjs` 已遞迴複製整個 `assets/`（build-data.mjs:98），**構建腳本無需修改**；dist 自然取得字體。
- 取得分片為一次性手動/腳本動作，記入實作 plan；字型版權為 OFL，可散佈，需在 `assets/fonts/zen-maru/` 附 OFL 授權檔。
- 字體顯示策略 `font-display: swap`；標題最壞情況先以 PingFang TC 呈現再換圓體，不封鎖渲染。

## 7. 響應式

沿用既有兩個斷點（≤600px、≤420px）與其排版規則（搜尋框整列、下拉兩列、420px 以下全寬）。追加：

- hero 三列在窄屏維持現有縮排規則，背景清晰層以窄螢幕中心計算，邊緣虛化半徑加寬，避免出現硬邊；
- 貼紙卡在 420px 以下為 2 欄時，圓角降到 14px、陰影減半；
- 觸控無 hover，卡體不依賴 hover 傳達資訊（本就只有位移效果）。

## 8. 檔案改動清單

- `styles.css`——主要改動：token 翻淺、背景層遷移至 hero、全元件淺色化、屬性淡色表、字體引用。
- `index.html`——僅在需要時調整字體 `<link>`；其餘結構不動。
- `assets/fonts/zen-maru/`——新增（css＋woff2 分片＋OFL）。
- `app.js`——**預期零改動**；若裝飾性元素（如標題 ✿）需由 JS 注入再做最小修改，✿ 優先以 CSS `::after` 實作。
- `scripts/build-data.mjs`——不改。
- 不動：`overrides/`（detail 石盤頁）、`rank/`、`ui-helpers.mjs`。

## 9. 驗收方式

1. `npm run build` 成功，輸出拍組/活動數量與現況一致（653／84，以目前資料為準）。
2. `npm test` 既有測試全綠。
3. 本地以 http.server 服務 `dist/`，桌面 1280px 與手機 390px 各截圖檢查：
   - hero：salina 中央清晰、四邊看不到硬邊、底部無縫融入奶油底；
   - 篩選列在任何背景位置文字清晰（延續前導修改的可讀性要求）；
   - 拍組卡：含七種 rank、17 屬性、限定標籤、場效/鬥陣晶片、EX 切換鈕各至少一張實卡，對比都清楚；
   - 活動頁籤：進行中/即將/已結束三態徽章可區分；
   - 分頁、空狀態（用無結果搜尋觸發）、footer 淺色化一致。
4. DevTools 離線模式重整：Zen Maru 標題仍為圓體（自託管驗證）。
5. 無 console 錯誤；卡片連結、EX 切換、篩選、分頁互動行為與改前一致。

## 10. 風險

- 日文圓體的少量和式字形（如「関」對「關」）——Zen Maru Gothic 缺 Big5 常用字時會回退到 Noto Sans TC 或系統繁體，實作時以站內常見字（拍組名含「關/澀/邊」等）逐字截圖確認；若出現明顯破字，該處用 Noto Sans TC 覆蓋。
- 淺底上薄荷、橙兩主色對比偏弱，已用加深的 `--mint`/`--orange` 與深字規則處理，最終以截圖為準。
