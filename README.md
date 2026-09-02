# Sync Grid 資料入口

這是一個獨立的 Node.js 資料入口，透過 `sync-grid` Git 子模組讀取資料，建構出包含自訂詳情頁樣式的 `dist/` 靜態網站。

## 第一次設定

先建立 `portal` 自己的 Git 儲存庫，再加入 `Sync-Grid` 子模組：

```bash
cd portal
git init
git branch -M main
git remote add origin <portal-遠端倉庫地址>
git submodule add git@github.com:MiMirHenryStone/Sync-Grid.git sync-grid
npm install
npm run build
git add .gitmodules sync-grid package.json package-lock.json scripts overrides index.html styles.css app.js ui-helpers.mjs web-path.mjs
git commit -m "初始化 portal 與 Sync-Grid 子模組"
git push -u origin main
```

其他人取得專案時，需一併初始化子模組：

```bash
git clone <portal-遠端倉庫地址>
cd portal
git submodule update --init --recursive
npm run build
```

## 使用方式

在 `portal` 目錄執行：

```bash
node scripts/build-data.mjs
```

將 `dist/` 目錄作為靜態網站根目錄。

## 更新資料

更新 `Sync-Grid` 子模組並重建 `data.js`：

```bash
npm run update
```

如果需要使用本機其他資料源，可透過 `SYNC_GRID_DIR` 覆蓋子模組路徑：

```bash
SYNC_GRID_DIR=/path/to/Sync-Grid npm run build
```

## 測試

```bash
node --test test/*.test.mjs
```
