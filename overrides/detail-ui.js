(() => {
  const content = document.querySelector('.content');
  const grid = document.querySelector('.grid');
  if (!content) return;

  // 返回入口頁時保留清單的查詢狀態：優先用卡片連結帶的 back，其次用同站 referrer。
  function resolveBackHref() {
    const from = new URLSearchParams(location.search).get('back');
    if (from && from.startsWith('?')) return `../../index.html${from}`;
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && ref.pathname.endsWith('/index.html')) {
        return `../../index.html${ref.search}`;
      }
    } catch { /* 無 referrer 時回預設 */ }
    return '../../index.html';
  }

  const back = document.createElement('a');
  back.className = 'detail-back';
  back.href = resolveBackHref();
  back.textContent = '返回拍組圖鑑';
  document.body.insertBefore(back, document.body.firstElementChild);

  const addSection = (element, key, label) => {
    const id = `${element.id || 'detail'}-${key}`;
    element.id = id;
    const heading = document.createElement('h3');
    heading.className = 'detail-section-title';
    heading.textContent = label;
    element.before(heading);
  };

  const SUPER_AWAKENING_PREFIX = '超覺醒被動技能';

  // 舊版頁面用內嵌 hex（含 alpha 的 8 碼）標色；抽出 6 碼原色，剝離時一併清掉。
  const readInlineHex = (element) => element.getAttribute('style')?.match(/#([0-9a-f]{6})/i)?.[1]
    ? `#${element.getAttribute('style').match(/#([0-9a-f]{6})/i)[1]}`
    : '';

  // WCAG 相對亮度決定飽和底上用白字還是深墨字（Material 對比做法）。
  function inkFor(hex) {
    const value = parseInt(hex.slice(1), 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    const linear = channels.map((channel) => {
      const srgb = channel / 255;
      return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    return luminance > 0.34 ? '#263238' : '#ffffff';
  }

  // 訓練家招式舊色票 #6dbfb1 濁且淡，統一換成飽和 teal。
  const moveHex = (hex) => (hex.toLowerCase() === '#6dbfb1' ? '#0d9488' : hex);

  // 招式名後的 ▭▭▭（U+25AD）代表使用次數，換成天藍色膠囊能量條。
  function tagMoveUses(table) {
    const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.nodeValue.includes('▭') && !node.parentElement.closest('input,button')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT),
    });
    const targets = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) targets.push(node);
    targets.forEach((node) => {
      const parts = node.nodeValue.split(/(▭+)/).filter(Boolean);
      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (!part.startsWith('▭')) {
          fragment.append(document.createTextNode(part));
          return;
        }
        const bar = document.createElement('span');
        bar.className = 'move-uses';
        bar.setAttribute('aria-label', `需要能量 ${part.length} 格`);
        for (let i = 0; i < part.length; i += 1) bar.append(document.createElement('i'));
        fragment.append(bar);
      });
      node.replaceWith(fragment);
    });
  }

  // 把被動表格的第一行（技能名）包成 .passive-name 以利上色。
  function emphasizeFirstLine(table) {
    const cell = table.querySelector('td');
    if (!cell || cell.querySelector('.passive-name')) return;
    const firstBr = cell.querySelector('br');
    const name = document.createElement('div');
    name.className = 'passive-name';
    if (firstBr) {
      while (cell.firstChild && cell.firstChild !== firstBr) name.appendChild(cell.firstChild);
      cell.insertBefore(name, firstBr);
      firstBr.replaceWith(document.createTextNode(' '));
    }
  }

  // 超覺醒被動的表格原寫在潛能餅乾之後，視覺上會被當成潛能；先加上專屬樣式並移回被動段。
  function tagSuperAwakening(table) {
    const cell = table.querySelector('td');
    const firstNode = cell?.firstChild;
    if (firstNode?.nodeType === Node.TEXT_NODE && firstNode.textContent.startsWith(SUPER_AWAKENING_PREFIX)) {
      firstNode.textContent = firstNode.textContent.slice(SUPER_AWAKENING_PREFIX.length).replace(/^[：:]\s*/, '');
      const badge = document.createElement('span');
      badge.className = 'sa-badge';
      badge.textContent = SUPER_AWAKENING_PREFIX;
      cell.insertBefore(badge, firstNode);
    }
  }

  // 招式表格用外框標出類型：拍組招式屬性深色框、拍組極巨化招式深紅框、同步招式屬性色融合炫彩框。
  function frameMoveTable(table, modifier) {
    const frame = document.createElement('div');
    frame.className = `move-frame ${modifier}`;
    // 內聯底色是 8 碼 hex（屬性色＋透明度），取前 6 碼當外框融合色；移除內聯底色，
    // 否則半透明底色會讓框的漸層整片透進表格內容。
    const rawHex = readInlineHex(table);
    const hex = moveHex(rawHex);
    table.style.backgroundColor = '';
    if (hex) {
      frame.style.setProperty('--move-color', hex);
      frame.style.setProperty('--move-ink', inkFor(hex));
    }
    table.before(frame);
    frame.append(table);
  }

  content.querySelectorAll(':scope > div').forEach((panel, panelIndex) => {
    const tables = [...panel.querySelectorAll(':scope > table')];
    if (!tables.length) return;
    const prefix = panel.id || `panel-${panelIndex}`;

    // 被動表格分類：一般（青）／同步被動（紫 #d18eff）／潛能餅乾（琥珀）／超覺醒（彩虹）。
    const passiveTables = tables.filter((table) => table.classList.contains('passive'));
    const isCookieTable = (table) => table.textContent.includes('潛能餅乾');
    let firstCookie = null;
    const superTables = [];
    passiveTables.forEach((table) => {
      const hex = readInlineHex(table).toLowerCase();
      table.style.backgroundColor = '';
      if (isCookieTable(table)) {
        table.classList.add('passive-cookie');
        emphasizeFirstLine(table);
        firstCookie ??= table;
      } else if (table.textContent.trimStart().startsWith(SUPER_AWAKENING_PREFIX)) {
        table.classList.add('passive-super');
        tagSuperAwakening(table);
        superTables.push(table);
      } else {
        table.classList.add(hex === '#d18eff' ? 'passive-sync' : 'passive-general');
        emphasizeFirstLine(table);
      }
    });
    // 維持原相對順序，把超覺醒被動移到餅乾表格之前（即被動能力段末端）。
    superTables.forEach((table) => { if (firstCookie) firstCookie.before(table); });

    if (tables[0]) addSection(tables[0], `${prefix}-profile`, '基本資料');
    if (tables[1]) addSection(tables[1], `${prefix}-stats`, '能力值');
    if (tables.some((table) => table.classList.contains('move'))) addSection(tables.find((table) => table.classList.contains('move')), `${prefix}-moves`, '招式');
    const firstPassive = passiveTables.find((table) => !isCookieTable(table));
    if (firstPassive) addSection(firstPassive, `${prefix}-passives`, '被動能力');
    if (firstCookie) addSection(firstCookie, `${prefix}-cookies`, '潛能');

    panel.querySelectorAll('table.move').forEach((table) => {
      const label = table.querySelector('tr:first-child td:first-child')?.textContent.trim() ?? '';
      if (label.startsWith('拍組極巨化招式')) frameMoveTable(table, 'frame-max');
      else if (label.startsWith('拍組招式')) frameMoveTable(table, 'frame-sync');
      else if (label.startsWith('同步招式')) frameMoveTable(table, 'frame-buddy');
    });
    // 未加框的一般招式：抽出屬性色當 --c，表頭列實心、標籤欄淡色調。
    panel.querySelectorAll('table.move').forEach((table) => {
      tagMoveUses(table);
      const rawHex = readInlineHex(table);
      const hex = moveHex(rawHex);
      table.style.backgroundColor = '';
      if (!rawHex || table.parentElement?.classList.contains('move-frame')) return;
      table.style.setProperty('--c', hex);
      table.style.setProperty('--ink', inkFor(hex));
    });
    const teamTable = tables.find((table) => table.classList.contains('team'));
    if (teamTable) {
      addSection(teamTable, `${prefix}-tags`, '標籤');
      // 標籤表最後一列是探索特性（火辣辣／心暖暖／淚閃閃／稀有…，全寬置中），抽出獨立成段。
      let exploreRow = null;
      for (const row of teamTable.rows) {
        if ([...row.cells].some((cell) => cell.colSpan > 1)) exploreRow = row;
      }
      if (exploreRow) {
        exploreRow.remove();
        const exploreTable = document.createElement('table');
        exploreTable.className = 'explore';
        exploreTable.append(exploreRow);
        teamTable.after(exploreTable);
        addSection(exploreTable, `${prefix}-explore`, '探索特性');
      }
      // 標籤格：屬性標籤（自訂色）→ 飽和實心 chip；其餘（地區／主題，#6dbfb1）→ teal tonal。
      teamTable.querySelectorAll('td').forEach((cell) => {
        const hex = readInlineHex(cell).toLowerCase();
        cell.style.backgroundColor = '';
        cell.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode(' ')));
        if (hex && hex !== '#6dbfb1') {
          cell.classList.add('tag-attr');
          cell.style.setProperty('--c', hex);
          cell.style.setProperty('--ink', inkFor(hex));
        } else {
          cell.classList.add('tag-generic');
        }
      });
    }
  });

  // 部分變化形態只提供能力值百分比，補算成完整等級表方便直接比較。
  const baseStats = [...content.querySelectorAll(':scope > div > table')].find((table) => table.querySelector('tr:first-child td')?.textContent.trim() === 'Lv.');
  if (baseStats) {
    // 六維列舊式淡底色移除，改以飽和語意色標示標題儲存格。
    const statTone = { ＨＰ: 'hp', 攻擊: 'attack', 防禦: 'defense', 特攻: 'spattack', 特防: 'spdefense', 速度: 'speed' };
    [...baseStats.rows].forEach((row) => {
      const label = row.cells[0]?.textContent.trim() ?? '';
      row.style.background = '';
      row.classList.add(statTone[label] ? `stat-${statTone[label]}` : 'stat-level');
    });
    content.querySelectorAll(':scope > div > table').forEach((table) => {
      const percentageRows = [...table.rows].filter((row) => row.cells.length === 2 && /\d+%/.test(row.cells[1].textContent));
      if (percentageRows.length < 5 || percentageRows.length !== table.rows.length || table === baseStats || table.dataset.generatedStats) return;
      const generated = baseStats.cloneNode(true);
      generated.dataset.generatedStats = 'true';
      percentageRows.forEach((row) => {
        const percent = Number(row.cells[row.cells.length - 1].textContent.match(/\d+/)?.[0]);
        const statName = row.cells[0].textContent.trim();
        const target = [...generated.rows].find((candidate) => candidate.cells[0]?.textContent.trim() === statName);
        if (!target || !percent) return;
        [...target.cells].slice(1).forEach((cell) => {
          const value = Number(cell.textContent.trim());
          if (Number.isFinite(value)) cell.textContent = Math.round(value * percent / 100);
        });
      });
      table.replaceWith(generated);
    });
  }
  // 所有表格包一層橫向捲動外殼：窄視窗由外殼捲動，表格本身維持 width:100%
  // 填滿邊框，內容過寬才出現捲軸（避免 display:block 表格收縮留白）。
  content.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-scroll')) return;
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    table.before(scroll);
    scroll.append(table);
  });

  if (grid) grid.before(back);

  // 明確管理內容 Tab，避免不同瀏覽器對 :target 初始狀態處理不一致。
  const panels = [...content.children];
  const tabs = [...document.querySelectorAll('.tab a')];

  // 雙形態頁的第二（以上）個 Tab：由面板內容與 Tab 名判定是極巨化／太晶化／超級進化，補上官方徽章。
  const FORM_BADGES = {
    dyna: { src: '../../assets/forms/dyna.png', label: '極巨化形態' },
    mega: { src: '../../assets/forms/mega.png', label: '超級進化形態' },
    tera: { src: '../../assets/forms/tera.png', label: '太晶化形態' },
  };
  const detectForm = (panel, tabText) => {
    const text = panel.textContent;
    if (text.includes('拍組極巨化招式')) return 'dyna';
    if (text.includes('太晶')) return 'tera';
    if (tabText.startsWith('超級')) return 'mega';
    return null;
  };
  tabs.forEach((tab, index) => {
    if (index === 0 || !panels[index]) return;
    const tabText = tab.textContent.trim();
    const kind = detectForm(panels[index], tabText);
    if (!kind) return;
    const { src, label } = FORM_BADGES[kind];
    const tabIcon = document.createElement('img');
    tabIcon.className = 'form-badge form-badge-tab';
    tabIcon.src = src;
    tabIcon.alt = '';
    tabIcon.title = label;
    tabIcon.setAttribute('aria-label', label);
    tab.append(tabIcon);

    const ribbon = document.createElement('div');
    ribbon.className = `form-ribbon form-ribbon-${kind}`;
    const panelIcon = document.createElement('img');
    panelIcon.className = 'form-badge form-badge-ribbon';
    panelIcon.src = src;
    panelIcon.alt = '';
    const text = document.createElement('span');
    text.textContent = label;
    ribbon.append(panelIcon, text);
    panels[index].prepend(ribbon);
  });
  const showPanel = (id) => {
    panels.forEach((panel) => { panel.style.display = panel.id === id ? 'block' : 'none'; });
    tabs.forEach((tab) => tab.classList.toggle('is-active', tab.getAttribute('href') === `#${id}`));
  };
  tabs.forEach((tab) => tab.addEventListener('click', (event) => {
    event.preventDefault();
    const id = tab.getAttribute('href').slice(1);
    showPanel(id);
    history.replaceState(null, '', `#${id}`);
  }));
  const initialTarget = location.hash.slice(1);
  const initialPanel = panels.find((panel) => panel.id === initialTarget);
  showPanel(initialPanel?.id || tabs[0]?.getAttribute('href').slice(1));

  const autoPanelButton = document.querySelector('input[onclick*="autoPanel"]');
  if (autoPanelButton) {
    autoPanelButton.value = autoPanelButton.value || '自動連接選中格子';
    autoPanelButton.title = '依照目前已選取的格子，自動計算並連接一套石盤';
    autoPanelButton.setAttribute('aria-label', '自動連接選中格子：依照目前已選取的格子計算石盤');
  }

  const releaseItemSet = document.querySelector('#releaseItemSet');
  if (releaseItemSet) {
    // 原始程式只在有特殊道具時輸出文字，這裡補上固定標籤避免空白元件造成誤解。
    const updateReleaseItemLabel = () => {
      const raw = releaseItemSet.textContent.replace(/^解放道具：/, '').trim();
      const label = raw ? `解放道具：${raw}` : '解放道具：無';
      if (releaseItemSet.textContent !== label) releaseItemSet.textContent = label;
    };
    updateReleaseItemLabel();
    new MutationObserver(updateReleaseItemLabel).observe(releaseItemSet, { childList: true, characterData: true, subtree: true });
  }

  const orb = document.querySelector('#orb');
  if (orb && grid) {
    const level = document.createElement('select');
    level.id = 'panel-level';
    level.className = 'title';
    level.setAttribute('aria-label', '石盤等級');
    level.innerHTML = '<option value="1">石盤等級 1</option><option value="2">石盤等級 2</option><option value="3">石盤等級 3</option><option value="4">石盤等級 4</option><option value="5" selected>石盤等級 5</option>';
    orb.after(level);
    const updateLevel = () => {
      const maxLevel = Number(level.value);
      document.querySelectorAll('#grid polygon[id]').forEach((polygon, index) => {
        const tile = window.tiles?.[index];
        if (!tile) return;
        polygon.classList.toggle('level-locked', tile.lv > maxLevel);
      });
      document.querySelectorAll('#grid polygon[onclick]').forEach((polygon) => {
        const match = polygon.getAttribute('onclick').match(/c\([^,]+,(\d+)\)/);
        const tile = match && window.tiles?.find((item) => String(item.id) === match[1]);
        polygon.classList.toggle('level-locked-hitbox', Boolean(tile && tile.lv > maxLevel));
      });
    };
    level.addEventListener('change', updateLevel);
    const originalClick = window.c;
    if (typeof originalClick === 'function') {
      window.c = (event, id) => {
        const tile = window.tiles?.find((item) => String(item.id) === String(id));
        if (tile && tile.lv > Number(level.value)) return;
        originalClick(event, id);
        updateLevel();
      };
    }
    updateLevel();
  }
})();
