import { getPageItems, getViewFilters, getPairCategories, getPairRoles, getPairLimitedTags, getPairRoleLabel, matchesPairRole, pairAttributes, sortPairs } from './ui-helpers.mjs';
import { sourcePath } from './web-path.mjs';

(() => {
  const data = window.SYNC_GRID_DATA || { pairs: [], events: [] };
  const state = { tab: 'pairs', query: '', category: 'all', attribute: 'all', role: 'all', limitedTag: 'all', date: 'all', status: 'all', sort: 'base-desc', page: 1, pageSize: 12 };
  const labels = { active: '進行中', upcoming: '即將開始', ended: '已結束' };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const attributeClass = (attribute) => `attribute-${Math.max(0, pairAttributes.indexOf(attribute))}`;
  const formatDate = (value) => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(new Date(value));
  const eventStatus = (event) => { const now = new Date(); const start = new Date(event.start); const end = new Date(event.end); return now < start ? 'upcoming' : now > end ? 'ended' : 'active'; };

  function filteredRecords() {
    const query = state.query.trim().toLocaleLowerCase();
    const records = state.tab === 'pairs' ? data.pairs : data.events;
    const filtered = records.filter((record) => {
      const text = state.tab === 'pairs' ? `${record.name} ${record.category} ${record.limitedTag || ''}` : `${record.title} ${record.description}`;
      const matchesQuery = !query || text.toLocaleLowerCase().includes(query);
      const matchesCategory = state.tab === 'events' || state.category === 'all' || record.category === state.category;
      const matchesAttribute = state.tab === 'events' || state.attribute === 'all' || record.attributes?.includes(state.attribute);
      const matchesRole = state.tab === 'events' || state.role === 'all' || matchesPairRole(record, state.role);
      const matchesLimitedTag = state.tab === 'events' || state.limitedTag === 'all' || record.limitedTag === state.limitedTag;
      const matchesDate = state.tab === 'pairs' || state.date === 'all' || record.start.slice(0, 10) === state.date;
      const matchesStatus = state.tab === 'pairs' || state.status === 'all' || eventStatus(record) === state.status;
      return matchesQuery && matchesCategory && matchesAttribute && matchesRole && matchesLimitedTag && matchesDate && matchesStatus;
    });
    return state.tab === 'pairs' ? sortPairs(filtered, state.sort) : filtered;
  }

  const imageMarkup = (image, alt) => image
    ? `<img loading="lazy" src="${sourcePath(image)}" alt="${escapeHtml(alt)}" onerror="this.hidden=true">`
    : '';

  const exToggleMarkup = (record) => `<button class="ex-toggle" type="button" data-normal-image="${sourcePath(record.image)}" data-ex-image="${sourcePath(record.exImage)}" ${record.exImage ? '' : 'disabled'} aria-label="${record.exImage ? '目前為普通頭像，點擊切換到★6 EX' : '沒有★6 EX頭像'}" title="${record.exImage ? '目前為普通頭像，點擊切換到★6 EX' : '沒有★6 EX頭像'}">普通</button>`;

  function renderCard(record) {
    if (state.tab === 'pairs') return `<article class="pair-card ${attributeClass(record.attributes?.[0] ?? '')}"><a href="${sourcePath(record.href)}"><div class="pair-art">${imageMarkup(record.image, record.name)}${exToggleMarkup(record)}</div><div class="pair-meta">${record.baseTotal ? `<span class="pair-total">Lv.200 ${record.baseTotal}</span>` : ''}<span class="pair-name">${escapeHtml(record.name)}</span><div class="pair-badges">${record.limitedTag ? `<span class="pair-limited-tag">${escapeHtml(record.limitedTag)}</span>` : ''}<span class="pair-category">${escapeHtml(record.category)}</span>${record.role ? `<span class="pair-role ${record.role === '物理攻擊型' ? 'physical' : 'special'}">${escapeHtml(getPairRoleLabel(record.role))}</span>` : ''}${record.attributes?.map((attribute) => `<span class="attribute-chip ${attributeClass(attribute)}">${escapeHtml(attribute)}屬性</span>`).join('') ?? ''}</div></div></a></article>`;
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
    document.querySelectorAll('.pair-only').forEach((control) => {
      const isPairToolbarControl = ['sort', 'limited'].includes(control.dataset.filter);
      control.hidden = state.tab !== 'pairs' || (!isPairToolbarControl && !getViewFilters(state.tab).includes(control.dataset.filter));
    });
    document.querySelectorAll('.event-only').forEach((control) => { control.hidden = !getViewFilters(state.tab).includes(control.dataset.filter); });
  }

  function setTab(tab) { state.tab = tab; state.page = 1; document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tab)); render(); }
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  $('#search').addEventListener('input', (event) => { state.query = event.target.value; state.page = 1; render(); });
  $('#category-filter').addEventListener('change', (event) => { state.category = event.target.value; state.page = 1; render(); });
  $('#attribute-filter').addEventListener('change', (event) => { state.attribute = event.target.value; state.page = 1; render(); });
  $('#role-filter').addEventListener('change', (event) => { state.role = event.target.value; state.page = 1; render(); });
  $('#limited-tag-filter').addEventListener('change', (event) => { state.limitedTag = event.target.value; state.page = 1; render(); });
  $('#status-filter').addEventListener('change', (event) => { state.status = event.target.value; state.page = 1; render(); });
  $('#date-filter').addEventListener('change', (event) => { state.date = event.target.value; state.page = 1; render(); });
  $('#page-size').addEventListener('change', (event) => { state.pageSize = Number(event.target.value); state.page = 1; render(); });
  $('#sort-filter').addEventListener('change', (event) => { state.sort = event.target.value; state.page = 1; render(); });
  $('#clear-filters').addEventListener('click', () => {
    Object.assign(state, { query: '', category: 'all', attribute: 'all', role: 'all', limitedTag: 'all', date: 'all', status: 'all', sort: 'base-desc', page: 1 });
    $('#search').value = '';
    ['category-filter', 'attribute-filter', 'role-filter', 'limited-tag-filter', 'date-filter', 'status-filter', 'sort-filter'].forEach((id) => { $(`#${id}`).value = id === 'sort-filter' ? 'base-desc' : 'all'; });
    render();
  });
  $('#pagination').addEventListener('click', (event) => { const page = Number(event.target.dataset.page); if (page) { state.page = page; render(); window.scrollTo({ top: 300, behavior: 'smooth' }); } });
  $('#pair-count').textContent = data.pairs.length; $('#event-count').textContent = data.events.length;
  $('#category-filter').innerHTML = ['<option value="all">全部分類</option>', ...getPairCategories(data.pairs).map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)].join('');
  $('#attribute-filter').innerHTML = ['<option value="all">全部屬性</option>', ...pairAttributes.map((attribute) => `<option value="${attribute}">${attribute}</option>`)].join('');
  $('#role-filter').innerHTML = ['<option value="all">全部攻擊方式</option>', ...getPairRoles(data.pairs).map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`)].join('');
  $('#limited-tag-filter').innerHTML = ['<option value="all">全部限定標籤</option>', ...getPairLimitedTags(data.pairs).map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)].join('');
  $('#date-filter').innerHTML = ['<option value="all">全部日期</option>', ...[...new Set(data.events.map((event) => event.start.slice(0, 10)))].map((date) => `<option value="${date}">${date.replaceAll('-', '/')}</option>`)].join('');
  render();
})();
