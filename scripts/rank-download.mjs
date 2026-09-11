#!/usr/bin/env node
// 從騰訊文件一鍵下載田雞榜 xlsx 到 rank/榜单.xlsx。
//
// 騰訊的「匯出 xlsx」API 必須登入帳號，訪客呼叫一律 403。本腳本用系統 Chrome
// ＋持久化設定檔跑：
//   npm run rank:login   開瀏覽器登入一次（QQ／微信掃碼皆可），cookie 保存在
//                        rank/.chrome-profile，之後免登入
//   npm run rank         管線前自動無頭下載；cookie 過期時會提示重跑 rank:login
//
// 繞開 UI 選單、直接在已登入的頁面 context 內呼叫官方匯出 API：
//   公開連結 id（DSW...）→ dop-api/opendoc 換內部 localPadId
//   → POST /v1/export/export_office（docId=domainId$localPadId）取得 operationId
//   → 輪詢 /v1/export/query_progress 到 100% → file_url 觸發瀏覽器下載。

import { existsSync, renameSync, statSync, mkdirSync, rmSync, openSync, closeSync, readSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import puppeteer from 'puppeteer-core';

const portalDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC_URL = process.env.RANK_DOC_URL ?? 'https://docs.qq.com/sheet/DSWp2aXZHSUphT1lW?tab=n44aze';
const PUBLIC_ID = DOC_URL.match(/docs\.qq\.com\/sheet\/([A-Za-z0-9]+)/)?.[1];
const TAB_ID = new URL(DOC_URL).searchParams.get('tab') ?? '';
const PROFILE_DIR = resolve(portalDir, 'rank/.chrome-profile');
const TARGET_XLSX = resolve(portalDir, 'rank/榜单.xlsx');
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DOMAIN_ID = process.env.QQ_DOMAIN_ID ?? '300000000';

if (!PUBLIC_ID) {
  console.error(`✗ 無法從 RANK_DOC_URL 解析文件 id：${DOC_URL}`);
  process.exit(1);
}
if (!existsSync(CHROME_PATH)) {
  console.error(`✗ 找不到系統 Chrome：${CHROME_PATH}（可用 CHROME_PATH 環境變數指定路徑）`);
  process.exit(1);
}

const loginMode = process.argv.includes('--login');
mkdirSync(PROFILE_DIR, { recursive: true });

async function launchBrowser(headless) {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: PROFILE_DIR,
    headless,
    defaultViewport: { width: 1280, height: 860 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

if (loginMode) {
  const browser = await launchBrowser(false);
  const page = await browser.newPage();
  await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('瀏覽器已開啟。請在視窗裡登入騰訊文件（QQ 或微信掃碼皆可），');
  console.log('登入成功、能正常看到表格後，回到終端機按 Enter 完成。');
  const rl = createInterface({ input, output });
  await rl.question('按 Enter 結束登入…');
  rl.close();
  await browser.close();
  console.log('✓ 登入態已保存，之後可直接跑 npm run rank 自動下載。');
  process.exit(0);
}

const browser = await launchBrowser('new');
try {
  const page = await browser.newPage();
  await page.goto(DOC_URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

  const result = await page.evaluate(async ({ publicId, tabId, domainId }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    try {
      // 1) 公開連結 id → 內部 localPadId
      const openRes = await fetch(
        `https://docs.qq.com/dop-api/opendoc?id=${publicId}&tab=${tabId}&normal=1&outformat=1&startrow=0&endrow=1&startcol=0&endcol=1`,
        { credentials: 'include' },
      );
      const openData = await openRes.json();
      const localPadId = openData?.bodyData?.localPadId;
      if (!localPadId) return { ok: false, stage: 'opendoc', message: '回應裡找不到 localPadId（文件可能已改為非公開）' };
      const docId = `${domainId}$${localPadId}`;

      // 2) 建立匯出工作
      const exportRes = await fetch('https://docs.qq.com/v1/export/export_office', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ docId }).toString(),
      });
      const exportData = await exportRes.json();
      if (exportData.ret !== 0 && exportData.ret !== 200) {
        return { ok: false, stage: 'export', ret: exportData.ret, message: exportData.msg ?? '使用者身份認證失敗（請先跑 npm run rank:login）' };
      }
      const operationId = exportData.operationId;

      // 3) 輪詢進度直到完成
      for (let i = 0; i < 60; i += 1) {
        await sleep(2000);
        const progressRes = await fetch(
          `https://docs.qq.com/v1/export/query_progress?operationId=${encodeURIComponent(operationId)}`,
          { credentials: 'include' },
        );
        const progressData = await progressRes.json();
        if (progressData.ret !== 0 && progressData.ret !== 200) {
          return { ok: false, stage: 'progress', ret: progressData.ret, message: progressData.msg ?? '查詢匯出進度失敗' };
        }
        if (progressData.progress >= 100 && progressData.file_url) {
          return { ok: true, fileUrl: progressData.file_url, fileName: progressData.file_name ?? '榜单.xlsx' };
        }
      }
      return { ok: false, stage: 'timeout', message: '匯出逾時（120 秒未完成）' };
    } catch (error) {
      return { ok: false, stage: 'exception', message: String(error) };
    }
  }, { publicId: PUBLIC_ID, tabId: TAB_ID, domainId: DOMAIN_ID });

  if (!result.ok) {
    console.error(`✗ 下載失敗（${result.stage}）：${result.message}`);
    if (result.stage === 'export' && result.ret === 403) {
      console.error('  請先執行 npm run rank:login 完成登入（cookie 過期就再登入一次）。');
    }
    process.exit(2);
  }

  // 4) 用瀏覽器下載（file_url 帶臨時 token，走 Chrome 最保險），先存進暫存目錄再驗證。
  const downloadDir = resolve(PROFILE_DIR, 'downloads');
  rmSync(downloadDir, { recursive: true, force: true });
  mkdirSync(downloadDir, { recursive: true });
  const client = await page.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const downloaded = new Promise((resolveDownload) => {
    client.on('Browser.downloadProgress', (event) => {
      if (event.state === 'completed') resolveDownload(event);
    });
  });
  await page.evaluate((url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, result.fileUrl);
  await downloaded;
  await new Promise((r) => setTimeout(r, 800));

  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(downloadDir)).filter((name) => !name.endsWith('.crdownload'));
  if (files.length !== 1) {
    console.error(`✗ 下載目錄檔案數異常（預期 1 個）：${files.join(', ')}`);
    process.exit(1);
  }
  const downloadedPath = resolve(downloadDir, files[0]);
  const handle = openSync(downloadedPath, 'r');
  const head = Buffer.alloc(2);
  readSync(handle, head, 0, 2, 0);
  closeSync(handle);
  if (head.toString() !== 'PK') {
    console.error('✗ 下載的檔案不是 xlsx（開頭不是 PK zip 標記），可能被導到錯誤頁。');
    process.exit(1);
  }
  const sizeMb = (statSync(downloadedPath).size / 1024 / 1024).toFixed(1);

  if (existsSync(TARGET_XLSX)) renameSync(TARGET_XLSX, `${TARGET_XLSX}.bak`);
  renameSync(downloadedPath, TARGET_XLSX);
  rmSync(downloadDir, { recursive: true, force: true });
  console.log(`✓ 榜單已更新：rank/榜单.xlsx（${sizeMb} MB，來源「${result.fileName}」）`);
} finally {
  await browser.close();
}
