(() => {
  const content = document.querySelector('.content');
  const grid = document.querySelector('.grid');
  if (!content) return;

  const back = document.createElement('a');
  back.className = 'detail-back';
  back.href = '../../index.html';
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
    const bg = table.getAttribute('style')?.match(/background-color:\s*(#[0-9a-f]{6})/i)?.[1]
      || table.style.backgroundColor;
    table.style.backgroundColor = '';
    if (bg) frame.style.setProperty('--move-color', bg);
    table.before(frame);
    frame.append(table);
  }

  content.querySelectorAll(':scope > div').forEach((panel, panelIndex) => {
    const tables = [...panel.querySelectorAll(':scope > table')];
    if (!tables.length) return;
    const prefix = panel.id || `panel-${panelIndex}`;

    // 被動表格先分類：一般被動（保留原有底色）／潛能餅乾（暖色）／超覺醒（彩虹）。
    const passiveTables = tables.filter((table) => table.classList.contains('passive'));
    const isCookieTable = (table) => table.textContent.includes('潛能餅乾');
    let firstCookie = null;
    const superTables = [];
    passiveTables.forEach((table) => {
      if (isCookieTable(table)) {
        table.classList.add('passive-cookie');
        table.style.backgroundColor = '';
        firstCookie ??= table;
      } else if (table.textContent.trimStart().startsWith(SUPER_AWAKENING_PREFIX)) {
        table.classList.add('passive-super');
        table.style.backgroundColor = '';
        tagSuperAwakening(table);
        superTables.push(table);
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
    }
  });

  // 部分變化形態只提供能力值百分比，補算成完整等級表方便直接比較。
  const baseStats = [...content.querySelectorAll(':scope > div > table')].find((table) => table.querySelector('tr:first-child td')?.textContent.trim() === 'Lv.');
  if (baseStats) {
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
  if (grid) grid.before(back);

  // 明確管理內容 Tab，避免不同瀏覽器對 :target 初始狀態處理不一致。
  const panels = [...content.children];
  const tabs = [...document.querySelectorAll('.tab a')];
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
