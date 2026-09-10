import { getPageItems, getViewFilters, getPairCategories, getPairRoles, getPairLimitedTags, getPairRoleLabel, matchesPairRole, pairAttributes, sortPairs, getAttributeOptions, getFieldEffectOptions, getFieldEffectLabel, matchesFieldEffectSelection, getFormationCategories, getFormationLabel, formationTone, matchesFormationSelection, getActiveFilterCount, getFilterOptionLabel, isFilterActive, rankLevels, rankFamily, getRankTierLabel } from './ui-helpers.mjs';
import { sourcePath } from './web-path.mjs';

(() => {
  const data = window.SYNC_GRID_DATA || { pairs: [], events: [] };
  // 多選篩選以陣列保存選中值（空陣列＝全部）；其餘維持單值 'all'。
  const DEFAULT_STATE = { tab: 'pairs', query: '', category: [], attribute: [], role: 'all', rank: [], limitedTag: [], fieldEffect: [], formation: [], date: 'all', status: 'all', sort: 'base-desc', page: 1, pageSize: 12 };
  const state = { ...DEFAULT_STATE, category: [], attribute: [], rank: [], limitedTag: [], fieldEffect: [], formation: [] };
  const MULTI_STATE_KEYS = ['category', 'attribute', 'rank', 'limitedTag', 'fieldEffect', 'formation'];
  const SINGLE_STATE_KEYS = [['role', 'all'], ['date', 'all'], ['status', 'all'], ['sort', 'base-desc']];
  const labels = { active: '進行中', upcoming: '即將開始', ended: '已結束' };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const attributeClass = (attribute) => `attribute-${Math.max(0, pairAttributes.indexOf(attribute))}`;
  const fieldEffectToneClass = (kind, code) => (kind === 'zone' ? attributeClass(code) : `field-${kind}-${code}`);
  const formatDate = (value) => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(new Date(value));
  const eventStatus = (event) => { const now = new Date(); const start = new Date(event.start); const end = new Date(event.end); return now < start ? 'upcoming' : now > end ? 'ended' : 'active'; };
  const filterLabels = { query: '搜尋', category: '分類', attribute: '屬性', role: '攻擊方式', rank: '田雞榜等級', limitedTag: '限定標籤', fieldEffect: '場效', formation: '鬥陣', date: '日期', status: '狀態' };
  const filterElements = { category: 'category-filter', role: 'role-filter', rank: 'rank-filter', limitedTag: 'limited-tag-filter', fieldEffect: 'field-effect-filter', formation: 'formation-filter', date: 'date-filter', status: 'status-filter' };
  // data-filter 與 state 鍵名的對應（僅限定標籤不同）；這些篩選為多選。
  const FILTER_STATE_KEY = { limited: 'limitedTag' };
  const MULTI_FILTER_KEYS = new Set(['category', 'attribute', 'rank', 'limitedTag', 'fieldEffect', 'formation']);
  const stateKeyOf = (filter) => FILTER_STATE_KEY[filter] ?? filter;

  // URL 即狀態：篩選/分頁可分享、重新整理後保留，瀏覽器上一頁也能回到上組條件。
  function writeStateToUrl() {
    const params = new URLSearchParams();
    if (state.tab !== 'pairs') params.set('tab', state.tab);
    if (state.query.trim()) params.set('q', state.query.trim());
    for (const key of MULTI_STATE_KEYS) {
      if (state[key].length) params.set(key, state[key].join(','));
    }
    for (const [key, fallback] of SINGLE_STATE_KEYS) {
      if (state[key] !== fallback) params.set(key, state[key]);
    }
    if (state.page !== 1) params.set('page', String(state.page));
    if (state.pageSize !== 12) params.set('pageSize', String(state.pageSize));
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  const optionValues = (id) => [...($(`#${id}`)?.options ?? [])].map((option) => option.value);
  const validSingle = (value, id) => (value != null && optionValues(id).includes(value) ? value : null);

  function readStateFromUrl() {
    Object.assign(state, DEFAULT_STATE, { category: [], attribute: [], rank: [], limitedTag: [], fieldEffect: [], formation: [] });
    const params = new URLSearchParams(location.search);
    state.tab = params.get('tab') === 'events' ? 'events' : 'pairs';
    state.query = params.get('q') ?? '';
    const multiFilterId = { category: 'category-filter', attribute: 'attribute-filter', rank: 'rank-filter', limitedTag: 'limited-tag-filter', fieldEffect: 'field-effect-filter', formation: 'formation-filter' };
    for (const key of MULTI_STATE_KEYS) {
      const raw = params.get(key);
      const allowed = new Set(optionValues(multiFilterId[key]));
      state[key] = raw
        ? [...new Set(raw.split(',').map((value) => value.trim()).filter((value) => value !== 'all' && allowed.has(value)))]
        : [];
    }
    const role = validSingle(params.get('role'), 'role-filter');
    if (role) state.role = role;
    const date = validSingle(params.get('date'), 'date-filter');
    if (date) state.date = date;
    if (['active', 'upcoming', 'ended'].includes(params.get('status'))) state.status = params.get('status');
    const sort = validSingle(params.get('sort'), 'sort-filter');
    if (sort) state.sort = sort;
    const pageSize = Number(params.get('pageSize'));
    if ([12, 24, 48].includes(pageSize)) state.pageSize = pageSize;
    const page = Number(params.get('page'));
    if (Number.isInteger(page) && page >= 1) state.page = page;
  }

  // 多選自訂選單直接讀 state；單選仍是原生 select，URL/前進後退後需把 DOM 對齊 state。
  function syncDomFromState() {
    $('#search').value = state.query;
    $('#role-filter').value = state.role;
    $('#status-filter').value = state.status;
    $('#date-filter').value = state.date;
    $('#sort-filter').value = state.sort;
    $('#page-size').value = String(state.pageSize);
    document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === state.tab));
  }

  function filteredRecords() {
    const query = state.query.trim().toLocaleLowerCase();
    const records = state.tab === 'pairs' ? data.pairs : data.events;
    const filtered = records.filter((record) => {
      const text = state.tab === 'pairs' ? `${record.name} ${record.category} ${record.limitedTag || ''}` : `${record.title} ${record.description}`;
      const matchesQuery = !query || text.toLocaleLowerCase().includes(query);
      const matchesCategory = state.tab === 'events' || state.category.length === 0 || state.category.includes(record.category);
      const matchesAttribute = state.tab === 'events' || state.attribute.length === 0 || record.attributes?.some((attribute) => state.attribute.includes(attribute));
      const matchesRole = state.tab === 'events' || state.role === 'all' || matchesPairRole(record, state.role);
      const matchesRank = state.tab === 'events' || state.rank.length === 0 || state.rank.includes(String(record.rank));
      const matchesLimitedTag = state.tab === 'events' || state.limitedTag.length === 0 || state.limitedTag.includes(record.limitedTag);
      const hasFieldEffect = state.tab === 'events' || matchesFieldEffectSelection(record, state.fieldEffect);
      const hasFormation = state.tab === 'events' || matchesFormationSelection(record, state.formation);
      const matchesDate = state.tab === 'pairs' || state.date === 'all' || record.start.slice(0, 10) === state.date;
      const matchesStatus = state.tab === 'pairs' || state.status === 'all' || eventStatus(record) === state.status;
      return matchesQuery && matchesCategory && matchesAttribute && matchesRole && matchesRank && matchesLimitedTag && hasFieldEffect && hasFormation && matchesDate && matchesStatus;
    });
    return state.tab === 'pairs' ? sortPairs(filtered, state.sort) : filtered;
  }

  const imageMarkup = (image, alt) => image
    ? `<img loading="lazy" src="${sourcePath(image)}" alt="${escapeHtml(alt)}" onerror="this.hidden=true">`
    : '';

  const exToggleMarkup = (record) => `<button class="ex-toggle" type="button" data-normal-image="${sourcePath(record.image)}" data-ex-image="${sourcePath(record.exImage)}" ${record.exImage ? '' : 'disabled'} aria-label="${record.exImage ? '目前為普通頭像，點擊切換到★6 EX' : '沒有★6 EX頭像'}" title="${record.exImage ? '目前為普通頭像，點擊切換到★6 EX' : '沒有★6 EX頭像'}">普通</button>`;

  // 場效／鬥陣若只能靠開石盤取得（gridLevel>1），於晶片右上角標註所需石盤等級。
  const gridLevelBadge = (level) => (Number(level) > 1 ? `<i class="chip-lv" title="需石盤等級 ${level}">${level}</i>` : '');

  const fieldEffectChip = (effect) => {
    const tone = fieldEffectToneClass(effect.kind, effect.code);
    return `<span class="field-chip ${tone}${effect.ex ? ' is-ex' : ''}${effect.sa ? ' is-sa' : ''}">${effect.ex ? 'EX' : ''}${escapeHtml(getFieldEffectLabel(effect.kind, effect.code))}${gridLevelBadge(effect.gridLevel)}${effect.sa ? '<i class="chip-sa" title="來自超覺醒被動技能">超</i>' : ''}</span>`;
  };

  const formationChip = (form) => `<span class="formation-chip formation-${formationTone(form.category)}">${escapeHtml(getFormationLabel(form.region, form.category))}${gridLevelBadge(form.gridLevel)}</span>`;

  function renderCard(record) {
    if (state.tab === 'pairs') return `<article class="pair-card ${attributeClass(record.attributes?.[0] ?? '')}"><a href="${sourcePath(record.href)}${location.search ? `?back=${encodeURIComponent(location.search)}` : ''}"><div class="pair-art">${imageMarkup(record.image, record.name)}${exToggleMarkup(record)}</div><div class="pair-meta"><span class="pair-topline">${record.baseTotal ? `<span class="pair-total">Lv.200 ${record.baseTotal}</span>` : ''}${record.rank != null ? `<span class="pair-rank rank-fam-${rankFamily(record.rank)}" title="田雞榜等級">${getRankTierLabel(record.rank)}</span>` : ''}</span><span class="pair-name">${escapeHtml(record.name)}</span><div class="pair-badges">${record.limitedTag ? `<span class="pair-limited-tag">${escapeHtml(record.limitedTag)}</span>` : ''}<span class="pair-category">${escapeHtml(record.category)}</span>${record.role ? `<span class="pair-role ${record.role === '物理攻擊型' ? 'physical' : 'special'}">${escapeHtml(getPairRoleLabel(record.role))}</span>` : ''}${record.attributes?.map((attribute) => `<span class="attribute-chip ${attributeClass(attribute)}">${escapeHtml(attribute)}屬性</span>`).join('') ?? ''}${(record.fieldEffects ?? []).map(fieldEffectChip).join('')}${(record.formations ?? []).map(formationChip).join('')}</div></div></a></article>`;
    const status = eventStatus(record);
    return `<article class="event-card"><div class="event-visual">${record.image ? imageMarkup(record.image, record.title) : '<div class="event-art-empty" aria-hidden="true"></div>'}</div><div class="event-info"><div class="event-dates">${formatDate(record.start)} — ${formatDate(record.end)}<span class="event-status ${status}">${labels[status]}</span></div><h3 class="event-title">${escapeHtml(record.title)}</h3><p class="event-desc">${escapeHtml(record.description || '暫無活動說明')}</p></div></article>`;
  }

  function renderPagination(totalPages) {
    const pagination = $('#pagination');
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }
    const buttons = [`<button class="page-button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>上一頁</button>`];
    getPageItems(state.page, totalPages).forEach((page) => {
      if (typeof page === 'string') buttons.push(`<span class="page-ellipsis" aria-hidden="true">…</span>`);
      else buttons.push(`<button class="page-button ${page === state.page ? 'is-active' : ''}" data-page="${page}" aria-label="第 ${page} 頁">${page}</button>`);
    });
    buttons.push(`<button class="page-button" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>下一頁</button>`);
    pagination.innerHTML = buttons.join('');
  }

  function renderCustomSelects() {
    document.querySelectorAll('.custom-select').forEach((container) => {
      const select = container.querySelector('select');
      const key = container.dataset.filter;
      const stateKey = stateKeyOf(key);
      const multi = MULTI_FILTER_KEYS.has(stateKey);
      const selectedValues = multi ? state[stateKey] : null;
      let trigger = container.querySelector('.select-trigger');
      let menu = container.querySelector('.select-menu');
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.className = 'select-trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'listbox');
        container.insertBefore(trigger, select);
        menu = document.createElement('div');
        menu.className = `select-menu${key === 'attribute' ? ' attribute-menu' : ''}${key === 'fieldEffect' ? ' fieldeffect-menu' : ''}`;
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;
        container.append(menu);
        select.classList.add('visually-hidden');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
      }
      const triggerLabel = selectedValues
        ? (selectedValues.length === 0 ? '全部' : selectedValues.length === 1 ? getFilterOptionLabel(key, selectedValues[0]) : `${getFilterOptionLabel(key, selectedValues[0])} +${selectedValues.length - 1}`)
        : getFilterOptionLabel(key, select.options[select.selectedIndex]?.value || 'all');
      trigger.innerHTML = `<strong>${escapeHtml(triggerLabel)}</strong><i class="select-chevron" aria-hidden="true"></i>`;
      trigger.setAttribute('aria-expanded', String(!menu.hidden));

      const isSelected = (value) => (selectedValues ? (value === 'all' ? selectedValues.length === 0 : selectedValues.includes(value)) : select.value === value);
      const check = (on) => (on ? '<span class="option-check" aria-hidden="true">✓</span>' : '');
      const optionButton = (option, buttonClass = '', dotClass = '') => {
        const on = isSelected(option.value);
        const dot = dotClass ? `<i class="fx-dot ${dotClass}" aria-hidden="true"></i>` : '';
        return `<button class="select-option ${buttonClass}${on ? ' is-selected' : ''}" type="button" role="option" aria-selected="${on}" data-value="${escapeHtml(option.value)}">${dot}<span>${escapeHtml(option.text)}</span>${check(on)}</button>`;
      };

      if (key === 'fieldEffect') {
        const dotFor = (value) => {
          if (value === 'all') return '';
          if (value === 'ex') return 'fx-ex-dot';
          const colon = value.indexOf(':');
          return fieldEffectToneClass(value.slice(0, colon), value.slice(colon + 1));
        };
        const blocks = [
          optionButton(select.querySelector('option[value="all"]')),
          optionButton(select.querySelector('option[value="ex"]'), 'fx-ex-option', 'fx-ex-dot'),
        ];
        for (const group of select.querySelectorAll('optgroup')) {
          blocks.push(`<span class="fx-group-label" role="presentation">${escapeHtml(group.label)}</span>`);
          blocks.push([...group.querySelectorAll('option')].map((option) => optionButton(option, '', dotFor(option.value))).join(''));
        }
        menu.innerHTML = blocks.join('');
      } else {
        menu.innerHTML = [...select.options].map((option) => {
          const on = isSelected(option.value);
          const optionClass = key === 'attribute' && option.value !== 'all' ? attributeClass(option.value) : '';
          return `<button class="select-option ${optionClass}${on ? ' is-selected' : ''}" type="button" role="option" aria-selected="${on}" data-value="${escapeHtml(option.value)}"><span>${escapeHtml(getFilterOptionLabel(key, option.value))}</span>${check(on)}</button>`;
        }).join('');
      }
    });
  }

  function initializeCustomSelects() {
    renderCustomSelects();
  }

  function renderActiveFilters() {
    // 多選篩選每個選中值各產生一顆可單獨移除的晶片；單選篩選一顆。
    const chips = [];
    const push = (key, value, label) => {
      chips.push(`<button class="active-filter" type="button" data-clear-filter="${key}" data-clear-value="${escapeHtml(value)}">${filterLabels[key]}：${escapeHtml(label)}<span aria-hidden="true">×</span></button>`);
    };
    if (state.query.trim()) push('query', state.query, `「${state.query.trim()}」`);
    for (const key of ['category', 'attribute', 'role', 'rank', 'limitedTag', 'fieldEffect', 'formation', 'date', 'status']) {
      const value = state[key];
      if (Array.isArray(value)) value.forEach((item) => push(key, item, getFilterOptionLabel(key, item)));
      else if (value && value !== 'all') push(key, value, getFilterOptionLabel(key, value));
    }
    $('#clear-filters').textContent = getActiveFilterCount(state) ? `清除篩選（${getActiveFilterCount(state)}）` : '清除篩選';
    $('#active-filters').innerHTML = chips.length
      ? `<span class="active-filters-label">目前篩選</span>${chips.join('')}`
      : '';
  }

  function render() {
    const records = filteredRecords();
    const totalPages = Math.max(1, Math.ceil(records.length / state.pageSize));
    state.page = Math.min(state.page, totalPages);
    const visible = records.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    $('#content').innerHTML = visible.map(renderCard).join('');
    $('#content').querySelectorAll('.ex-toggle').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const image = button.closest('.pair-art').querySelector('img');
      if (!image) return;
      const isEx = button.classList.toggle('is-ex');
      image.src = isEx ? button.dataset.exImage : button.dataset.normalImage;
      button.textContent = isEx ? '★6 EX' : '普通';
      button.title = isEx ? '目前為★6 EX頭像，點擊切換到普通頭像' : '目前為普通頭像，點擊切換到★6 EX';
      button.setAttribute('aria-label', button.title);
    }));
    $('#empty').hidden = records.length > 0;
    $('#result-summary').textContent = `顯示 ${records.length ? (state.page - 1) * state.pageSize + 1 : 0}–${Math.min(state.page * state.pageSize, records.length)} 筆，共 ${records.length} 筆`;
    renderPagination(totalPages);
    $('#section-title').textContent = state.tab === 'pairs' ? '拍組圖鑑' : '活動日志';
    $('#section-kicker').textContent = state.tab === 'pairs' ? 'PAIR INDEX' : 'EVENT LOG';
    document.querySelectorAll('.custom-select').forEach((control) => {
      const stateKey = stateKeyOf(control.dataset.filter);
      const value = state[stateKey];
      const active = Array.isArray(value) ? value.length > 0 : isFilterActive(control.dataset.filter, control.querySelector('select').value);
      control.classList.toggle('is-active', active);
    });
    renderCustomSelects();
    renderActiveFilters();
    document.querySelectorAll('.pair-only').forEach((control) => {
      const isPairToolbarControl = ['sort', 'limited'].includes(control.dataset.filter);
      control.hidden = state.tab !== 'pairs' || (!isPairToolbarControl && !getViewFilters(state.tab).includes(control.dataset.filter));
    });
    document.querySelectorAll('.event-only').forEach((control) => { control.hidden = !getViewFilters(state.tab).includes(control.dataset.filter); });
    writeStateToUrl();
  }

  function setTab(tab) { state.tab = tab; state.page = 1; document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab)); render(); }
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  $('#search').addEventListener('input', (event) => { state.query = event.target.value; state.page = 1; render(); });
  $('#role-filter').addEventListener('change', (event) => { state.role = event.target.value; state.page = 1; render(); });
  $('#status-filter').addEventListener('change', (event) => { state.status = event.target.value; state.page = 1; render(); });
  $('#date-filter').addEventListener('change', (event) => { state.date = event.target.value; state.page = 1; render(); });
  $('#page-size').addEventListener('change', (event) => { state.pageSize = Number(event.target.value); state.page = 1; render(); });
  $('#sort-filter').addEventListener('change', (event) => { state.sort = event.target.value; state.page = 1; render(); });
  $('#clear-filters').addEventListener('click', () => {
    Object.assign(state, DEFAULT_STATE, { category: [], attribute: [], rank: [], limitedTag: [], fieldEffect: [], formation: [] });
    $('#search').value = '';
    ['role-filter', 'date-filter', 'status-filter', 'sort-filter'].forEach((id) => { $(`#${id}`).value = id === 'sort-filter' ? 'base-desc' : 'all'; });
    render();
  });
  $('#toolbar').addEventListener('click', (event) => {
    const trigger = event.target.closest('.select-trigger');
    const option = event.target.closest('.select-option');
    if (option) {
      // 擋住 document 的「點外側關閉」：多選時 render() 會重建選單、被點的選項鈕隨之卸載，
      // 若讓事件繼續冒泡，外側判斷會把卸載的目標誤認為「選單外」而把選單關掉。
      event.stopPropagation();
      const container = option.closest('.custom-select');
      const stateKey = stateKeyOf(container.dataset.filter);
      const value = option.dataset.value;
      if (MULTI_FILTER_KEYS.has(stateKey)) {
        // 多選：切換該值，選單保持展開以便連選；「全部」會清空。
        const list = state[stateKey];
        if (value === 'all') list.length = 0;
        else {
          const index = list.indexOf(value);
          if (index >= 0) list.splice(index, 1);
          else list.push(value);
        }
        state.page = 1;
        render();
        return;
      }
      const menu = option.closest('.select-menu');
      const select = container.querySelector('select');
      menu.hidden = true;
      container.querySelector('.select-trigger').setAttribute('aria-expanded', 'false');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (!trigger) return;
    const menu = trigger.parentElement.querySelector('.select-menu');
    document.querySelectorAll('.select-menu').forEach((other) => { if (other !== menu) other.hidden = true; });
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('.is-selected')?.focus();
  });
  $('#toolbar').addEventListener('keydown', (event) => {
    const menu = event.target.closest('.select-menu');
    if (!menu) return;
    const options = [...menu.querySelectorAll('.select-option')];
    const currentIndex = options.indexOf(document.activeElement);
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    options[(currentIndex + direction + options.length) % options.length].focus();
  });
  $('#active-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-clear-filter]');
    if (!button) return;
    const key = button.dataset.clearFilter;
    const value = button.dataset.clearValue;
    if (key === 'query') { state.query = ''; $('#search').value = ''; }
    else if (MULTI_FILTER_KEYS.has(key)) {
      const index = state[key].indexOf(value);
      if (index >= 0) state[key].splice(index, 1);
    } else {
      state[key] = 'all';
      const id = filterElements[key];
      if (id) $(`#${id}`).value = 'all';
    }
    state.page = 1;
    render();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select')) document.querySelectorAll('.select-menu').forEach((menu) => {
      menu.hidden = true;
      menu.closest('.custom-select')?.querySelector('.select-trigger')?.setAttribute('aria-expanded', 'false');
    });
  });
  document.addEventListener('keydown', (event) => {
    const openMenu = [...document.querySelectorAll('.select-menu')].find((menu) => !menu.hidden);
    if (event.key === 'Escape' && openMenu) {
      openMenu.hidden = true;
      const trigger = openMenu.closest('.custom-select').querySelector('.select-trigger');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });
  window.addEventListener('popstate', () => {
    readStateFromUrl();
    syncDomFromState();
    render();
  });
  $('#pagination').addEventListener('click', (event) => { const page = Number(event.target.dataset.page); if (page) { state.page = page; render(); window.scrollTo({ top: 300, behavior: 'smooth' }); } });
  $('#pair-count').textContent = data.pairs.length; $('#event-count').textContent = data.events.length;
  $('#category-filter').innerHTML = ['<option value="all">全部</option>', ...getPairCategories(data.pairs).map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join('');
  $('#attribute-filter').innerHTML = getAttributeOptions().map((attribute) => `<option value="${attribute}">${escapeHtml(getFilterOptionLabel('attribute', attribute))}</option>`).join('');
  $('#role-filter').innerHTML = ['<option value="all">全部</option>', ...getPairRoles(data.pairs).map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(getFilterOptionLabel('role', role))}</option>`)].join('');
  $('#rank-filter').innerHTML = ['<option value="all">全部</option>', ...rankLevels.map((tier) => `<option value="${tier.value}">${escapeHtml(tier.label)}</option>`)].join('');
  $('#limited-tag-filter').innerHTML = ['<option value="all">全部</option>', ...getPairLimitedTags(data.pairs).map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)].join('');
  const fieldGroupLabels = { weather: '天氣', terrain: '場地', zone: '領域' };
  $('#field-effect-filter').innerHTML =
    '<option value="all">全部</option><option value="ex">ＥＸ 場效</option>'
    + ['weather', 'terrain', 'zone'].map((kind) => {
      const options = getFieldEffectOptions().filter((effect) => effect.kind === kind)
        .map((effect) => `<option value="${effect.kind}:${escapeHtml(effect.code)}">${escapeHtml(effect.label)}</option>`).join('');
      return `<optgroup label="${fieldGroupLabels[kind]}">${options}</optgroup>`;
    }).join('');
  $('#formation-filter').innerHTML = ['<option value="all">全部</option>', ...getFormationCategories().map((category) => `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label)}</option>`)].join('');
  $('#date-filter').innerHTML = ['<option value="all">全部</option>', ...[...new Set(data.events.map((event) => event.start.slice(0, 10)))].map((date) => `<option value="${date}">${date.replaceAll('-', '/')}</option>`)].join('');
  initializeCustomSelects();
  readStateFromUrl();
  syncDomFromState();
  render();
})();
