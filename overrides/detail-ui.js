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

  content.querySelectorAll(':scope > div').forEach((panel, panelIndex) => {
    const tables = [...panel.querySelectorAll(':scope > table')];
    if (!tables.length) return;
    const prefix = panel.id || `panel-${panelIndex}`;
    if (tables[0]) addSection(tables[0], `${prefix}-profile`, '基本資料');
    if (tables[1]) addSection(tables[1], `${prefix}-stats`, '能力值');
    if (tables.some((table) => table.classList.contains('move'))) addSection(tables.find((table) => table.classList.contains('move')), `${prefix}-moves`, '招式');
    if (tables.some((table) => table.classList.contains('passive'))) addSection(tables.find((table) => table.classList.contains('passive')), `${prefix}-passives`, '被動能力');
    if (tables.some((table) => table.classList.contains('team'))) addSection(tables.find((table) => table.classList.contains('team')), `${prefix}-tags`, '標籤');
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
  const showPanel = (id) => panels.forEach((panel) => { panel.style.display = panel.id === id ? 'block' : 'none'; });
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
