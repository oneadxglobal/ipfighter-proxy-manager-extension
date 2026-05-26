const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

const PAGE_SIZE = 10;
let state = {
  proxies: [],
  rules: [],
  settings: {},
  currentPage: 1,
  editingProxyId: null,
  activeProxyId: null,
  sortCol: null,
  sortDir: 'asc'
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  bindNavigation();
  initCustomSelects();
  initTagSystem();
  bindProxyEvents();
  bindRuleEvents();
  bindSettingsEvents();

  api.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROXY_STATUS_UPDATED') {
      state.activeProxyId = message.data.enabled && message.data.info ? state.activeProxyId : null;
      msg('GET_PROXIES').then(proxies => {
        state.proxies = proxies || [];
        msg('GET_STATUS').then(status => {
          state.activeProxyId = status?.proxy?.id || null;
          renderProxyTable();
        });
      });
    }
    if (message.type === 'PROXY_CHECKING') {
      const proxyId = message.data?.proxy?.id;
      clearTimeout(window._checkingRenderTimer);
      window._checkingRenderTimer = setTimeout(() => {
        msg('GET_PROXIES').then(proxies => {
          state.proxies = proxies || [];
          // Chỉ render nếu không phải đang check đơn lẻ từ button
          // để tránh cả table nhảy về checking
          if (!proxyId) renderProxyTable();
          else {
            // Chỉ update status cell của đúng row đó
            const row = document.querySelector(`[data-id="${proxyId}"]`)?.closest('tr');
            if (row) {
              const statusCell = row.querySelector('.status-dot');
              if (statusCell) {
                statusCell.className = 'status-dot checking';
                statusCell.textContent = 'Checking...';
              }
            } else {
              renderProxyTable();
            }
          }
        });
      }, 300);
    }
  });
});

async function loadAll() {
  await loadTagHistory();
  state.proxies = await msg('GET_PROXIES') || [];
  state.rules = await msg('GET_RULES') || [];
  state.settings = await msg('GET_SETTINGS') || {};
  const statusData = await msg('GET_STATUS');
  state.activeProxyId = statusData?.proxy?.id || null;
  renderProxyTable();
  renderRulesList();
  loadSettingsUI();
  populateTagFilter();
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function msg(type, data = {}) {
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage({ type, data }, (r) => {
      if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
      else resolve(r);
    });
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      const tab = document.getElementById('tab-' + item.dataset.tab);
      if (tab) tab.classList.add('active');
      if (item.dataset.tab === 'rules') {
        loadBypassList();
      }
    });
  });
}

function bindProxyEvents() {
  document.getElementById('btnAddProxyOpt').addEventListener('click', () => openProxyModal());
  document.getElementById('btnCloseProxyModal').addEventListener('click', closeProxyModal);
  document.getElementById('proxyModalOverlay').addEventListener('click', closeProxyModal);
  document.getElementById('btnCancelProxy').addEventListener('click', closeProxyModal);
  document.getElementById('btnSaveProxyOpt').addEventListener('click', saveProxy);
  document.getElementById('btnDoExport').addEventListener('click', doExport);

  document.getElementById('btnImportOpt').addEventListener('click', () => {
    document.getElementById('importFileInput').value = '';
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    doImport(file);
  });

  document.getElementById('btnExport').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'flex';
  });
  document.getElementById('btnCloseExportModal').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });
  document.getElementById('exportModalOverlay').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });
  document.getElementById('btnCancelExport').addEventListener('click', () => {
    document.getElementById('exportModal').style.display = 'none';
  });

  document.getElementById('proxyTableBody').addEventListener('click', async (e) => {
    let t = e.target;
    while (t && t !== document.getElementById('proxyTableBody') && !t.dataset.action) {
      t = t.parentElement;
    }
    if (!t || !t.dataset.action) return;
    const id = t.dataset.id;
    if (t.dataset.action === 'edit') openProxyModal(state.proxies.find(p => p.id === id));
    if (t.dataset.action === 'delete') await deleteProxy(id);
    if (t.dataset.action === 'check') await checkProxy(id);
    if (t.dataset.action === 'pin') await pinProxy(id);
    if (t.dataset.action === 'copy') await copyProxy(id);
  });

  document.getElementById('proxyPagination').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    const p = btn.dataset.page;
    if (p === 'prev' && state.currentPage > 1) state.currentPage--;
    else if (p === 'next' && state.currentPage < totalPages(getFilteredProxies().length)) state.currentPage++;
    else if (!isNaN(p)) state.currentPage = parseInt(p);
    renderProxyTable();
  });

  // Select all / deselect all
  document.getElementById('checkAll').addEventListener('change', (e) => {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.checked = e.target.checked;
    });
    updateBulkActionBar();
  });

  document.getElementById('proxyTableBody').addEventListener('change', (e) => {
    if (e.target.classList.contains('row-checkbox')) {
      const all = document.querySelectorAll('#proxyTableBody .row-checkbox');
      const checked = document.querySelectorAll('#proxyTableBody .row-checkbox:checked');
      document.getElementById('checkAll').checked = all.length === checked.length;
      document.getElementById('checkAll').indeterminate = checked.length > 0 && checked.length < all.length;
      updateBulkActionBar();
    }
  });

  // document.getElementById('filterType').addEventListener('custom-change', () => {
  //   state.currentPage = 1;
  //   renderProxyTable();
  // });

  document.getElementById('filterStatus').addEventListener('custom-change', () => {
    state.currentPage = 1;
    renderProxyTable();
  });
  document.getElementById('filterSearch').addEventListener('input', () => {
    state.currentPage = 1;
    renderProxyTable();
  });
  document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      state.currentPage = 1;
      updateSortHeaders();
      renderProxyTable();
    });
  });

}

function totalPages(filteredCount) {
  const count = filteredCount !== undefined ? filteredCount : state.proxies.length;
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

function getSortedProxies() {
  const arr = [...state.proxies];

  if (!state.sortCol) {
    return arr.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
  }

  const dir = state.sortDir === 'asc' ? 1 : -1;
  const dateSort = ['expires', 'createdAt'];

  return arr.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (dateSort.includes(state.sortCol)) {
      const va = a[state.sortCol] ? new Date(a[state.sortCol]).getTime() : 0;
      const vb = b[state.sortCol] ? new Date(b[state.sortCol]).getTime() : 0;
      return (va - vb) * dir;
    } else {
      const va = (a[state.sortCol] || '').toString().toLowerCase();
      const vb = (b[state.sortCol] || '').toString().toLowerCase();
      return va.localeCompare(vb) * dir;
    }
  });
}

function getFilteredProxies() {
  const sorted = getSortedProxies();
  const typeVal = document.getElementById('filterType')?.dataset.value || '';
  const statusVal = document.getElementById('filterStatus')?.dataset.value || '';
  const searchVal = document.getElementById('filterSearch')?.value.trim().toLowerCase() || '';
  const { from: dateFrom, to: dateTo } = window.getDrpDates ? window.getDrpDates() : {};
  const selectedTags = window.getSelectedTags ? window.getSelectedTags() : [];


  return sorted.filter(p => {
    if (typeVal && p.type !== typeVal) return false;
    if (statusVal) {
      if (statusVal === 'active' && p.status !== 'active') return false;
      if (statusVal === 'inactive' && p.status === 'active') return false;
    }
    if (searchVal) {
      const haystack = [
        `${p.host}:${p.port}`,
        p.ip,
        p.note
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(searchVal)) return false;
    }
    if (dateFrom && dateTo) {
      if (!p.expires) return false;
      const exp = new Date(p.expires);
      exp.setHours(0, 0, 0, 0);
      if (exp < dateFrom || exp > dateTo) return false;
    }

    if (selectedTags.length > 0 && p.tag) {
      try {
        const tags = JSON.parse(p.tag);
        const hasTag = selectedTags.some(st => tags.find(t => t.name === st));
        if (!hasTag) return false;
      } catch (e) {
        return false;
      }
    } else if (selectedTags.length > 0) {
      return false;
    }
    return true;
  });
}

function populateTagFilter() {
  const allTags = [];
  state.proxies.forEach(p => {
    if (!p.tag) return;
    try {
      const tags = JSON.parse(p.tag);
      tags.forEach(t => {
        if (!allTags.find(x => x.name === t.name)) allTags.push(t);
      });
    } catch (e) { }
  });

  const list = document.getElementById('tagFilterList');
  list.innerHTML = allTags.map(t => `
    <label class="tag-filter-item">
      <input type="checkbox" value="${t.name}">
      <span>${t.name}</span>
    </label>
  `).join('');
}

(function () {
  let selectedTags = [];

  const trigger = document.getElementById('tagFilterTrigger');
  const dropdown = document.getElementById('tagFilterDropdown');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
    document.getElementById('tagFilterDropdown').style.display = 'none';  // thêm
    document.getElementById('tagFilterTrigger').classList.remove('active');
    document.getElementById('dateRangePopup').style.display = 'none';
    document.getElementById('dateRangeInput').classList.remove('active');
    const isOpen = dropdown.style.display !== 'none';
    dropdown.style.display = isOpen ? 'none' : 'block';
    trigger.classList.toggle('active', !isOpen);
  });

  dropdown.addEventListener('click', e => e.stopPropagation());

  function resetCheckboxes() {
    document.querySelectorAll('#tagFilterList input[type="checkbox"]').forEach(cb => {
      cb.checked = selectedTags.includes(cb.value);
    });
  }

  document.addEventListener('click', () => {
    if (dropdown.style.display !== 'none') {
      resetCheckboxes();
    }
    dropdown.style.display = 'none';
    trigger.classList.remove('active');
  });

  document.getElementById('tagFilterCancel').addEventListener('click', () => {
    resetCheckboxes();
    dropdown.style.display = 'none';
    trigger.classList.remove('active');
  });
  document.getElementById('tagFilterApply').addEventListener('click', () => {
    selectedTags = [...document.querySelectorAll('#tagFilterList input:checked')].map(cb => cb.value);
    dropdown.style.display = 'none';
    trigger.classList.remove('active');
    document.getElementById('tagFilterLabel').textContent = selectedTags.length ? `${selectedTags.length} tag(s)` : 'All Tags';
    state.currentPage = 1;
    renderProxyTable();
  });

  window.getSelectedTags = function () { return selectedTags; };
})();
function updateSortHeaders() {
  document.querySelectorAll('.th-sortable').forEach(th => {
    const col = th.dataset.sort;
    const asc = th.querySelector('.sort-asc');
    const desc = th.querySelector('.sort-desc');
    const isActive = state.sortCol === col;

    th.classList.toggle('sort-active', isActive);
    if (asc) asc.style.opacity = isActive && state.sortDir === 'asc' ? '1' : '0.25';
    if (desc) desc.style.opacity = isActive && state.sortDir === 'desc' ? '1' : '0.25';
  });
}
function renderProxyTable() {
  const tbody = document.getElementById('proxyTableBody');
  const thead = document.querySelector('#tab-proxies .table thead');
  const checkedIds = new Set(
    [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
      .map(cb => cb.dataset.id)
  );

  const sorted = getFilteredProxies();
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const page = sorted.slice(start, start + PAGE_SIZE);

  if (state.proxies.length === 0) {
    if (thead) thead.style.display = 'none';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No proxies configured. Click "+Add New Proxy" to get started.</td></tr>`;
    tbody.innerHTML += Array(PAGE_SIZE - 1).fill(`<tr style="height:53px;"><td colspan="11"></td></tr>`).join('');

    document.getElementById('proxyPagination').innerHTML = '';
    document.getElementById('checkAll').checked = false;
    document.getElementById('checkAll').indeterminate = false;
    updateBulkActionBar();
    return;
  }
  if (sorted.length === 0) {
    if (thead) thead.style.display = 'none';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No proxies found.</td></tr>`;
    tbody.innerHTML += Array(PAGE_SIZE - 1).fill(`<tr style="height:53px;"><td colspan="11"></td></tr>`).join('');
    document.getElementById('proxyPagination').innerHTML = '';
    document.getElementById('checkAll').checked = false;
    document.getElementById('checkAll').indeterminate = false;
    updateBulkActionBar();
    return;
  }

  if (thead) thead.style.display = '';
  tbody.innerHTML = page.map(p => {
    const statusClass = p.status === 'active' ? 'active' : p.status === 'error' ? 'error' : p.status === 'checking' ? 'checking' : '';
    const statusText = p.status === 'active' ? 'Active' : p.status === 'error' ? 'Error' : p.status === 'checking' ? 'Checking...' : '—';
    const statusCell = `<span class="status-dot ${statusClass}">${statusText}</span>`;

    const typeBadge = p.type === 'socks5' || p.type === 'socks4'
      ? `<span class="badge badge-socks">${p.type.toUpperCase()}</span>`
      : `<span class="badge badge-type">${p.type.toUpperCase()}</span>`;

    const expires = p.expires
      ? (new Date(p.expires) < new Date()
        ? `<span style="color:#FF6B6B;font-size:13px;">${p.expires}</span>`
        : `<span style="font-size:13px;">${p.expires}</span>`)
      : `<span class="text-muted">—</span>`;

    const createdAt = p.createdAt
      ? new Date(p.createdAt).toLocaleDateString('en-GB').replace(/\//g, '-')
      : '<span class="text-muted">—</span>';


    return `<tr style="${p.isPinned ? `background:${document.documentElement.getAttribute('data-theme') === 'light' ? '#fffbea' : '#3a3520'};` : ''}">
      <td><input type="checkbox" class="row-checkbox" data-id="${p.id}" ${checkedIds.has(p.id) ? 'checked' : ''}></td>
      <td>${typeBadge}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
         <span style="font-family:Consolas,monospace;font-size:13px;">${p.host}:${p.port}</span>
          ${p.isPinned ? `<img class="pin-icon" src="../../icons/pin-02.png" width="14" height="14" alt="Pinned">` : ''}
        </div>
      </td>
      <td>${statusCell}</td>
      <td style="font-family:Consolas,monospace;font-size:13px;">${p.ip || p.host}</td>
      <td style="font-size:13px;">
        ${p.location
        ? `<div style="display:flex;align-items:center;gap:6px;">
              ${p.countryCode ? `<img src="https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.6.0/flags/${p.countryCode.toLowerCase()}.svg" width="16" height="16" style="border-radius:50%;flex-shrink:0;" onerror="this.replaceWith('🌐')">` : ''}
              <span>${p.location}</span>
            </div>`
        : '<span class="text-muted">—</span>'
      }
      </td>
      <td>${renderTagBadges(p.tag)}</td>
      <td class="note-cell" data-id="${p.id}" style="max-width:120px;">
        <span class="note-display" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;" title="${esc(p.note || '')}">${p.note ? esc(p.note) : '<span class="text-muted">—</span>'}</span>
        <input class="note-input input" style="display:none;font-size:13px;padding:4px 8px;height:28px;" value="${esc(p.note || '')}" data-id="${p.id}">
      </td>
      <td>${expires}</td>
      <td style="font-size:13px;">${createdAt}</td>
      <td>
        <button class="btn-more" data-action="more" data-id="${p.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join('');
  const emptyRows = PAGE_SIZE - page.length;
  if (emptyRows > 0) {
    tbody.innerHTML += Array(emptyRows).fill(`<tr style="height:53px;"><td colspan="11"></td></tr>`).join('');
  }

  renderPagination(sorted.length);
  updateBulkActionBar();
  const allCbs = document.querySelectorAll('#proxyTableBody .row-checkbox');
  const checkedCbs = document.querySelectorAll('#proxyTableBody .row-checkbox:checked');
  const checkAll = document.getElementById('checkAll');
  checkAll.checked = allCbs.length > 0 && allCbs.length === checkedCbs.length;
  checkAll.indeterminate = checkedCbs.length > 0 && checkedCbs.length < allCbs.length;
}
function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  if (!bar) return;

  const checked = document.querySelectorAll('#proxyTableBody .row-checkbox:checked');
  if (checked.length > 0) {
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}
document.getElementById('bulkBtnDelete').addEventListener('click', () => {
  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);
  if (!checkedIds.length) return;
  showDeleteConfirm(checkedIds);
});
document.getElementById('bulkBtnCopy').addEventListener('click', async () => {
  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);
  if (!checkedIds.length) return;

  const proxies = state.proxies.filter(p => checkedIds.includes(p.id));
  const text = proxies.map(p =>
    p.username
      ? `${p.host}:${p.port}:${p.username}:${p.password}`
      : `${p.host}:${p.port}`
  ).join('\n');

  await navigator.clipboard.writeText(text);
  showToast(`Copied ${proxies.length} proxies!`, 'success');
});
document.getElementById('bulkBtnEdit').addEventListener('click', () => {
  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);
  if (!checkedIds.length) return;
  openBulkEditModal(checkedIds);
});

document.getElementById('bulkBtnCheck').addEventListener('click', async () => {
  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);
  if (!checkedIds.length) return;

  const btn = document.getElementById('bulkBtnCheck');
  btn.disabled = true;

  checkedIds.forEach(id => {
    const proxy = state.proxies.find(p => p.id === id);
    if (proxy) proxy.status = 'checking';
  });
  renderProxyTable();

  for (let i = 0; i < checkedIds.length; i++) {
    btn.innerHTML = `Checking`;

    await msg('CHECK_PROXY', { id: checkedIds[i] });

    state.proxies = await msg('GET_PROXIES') || [];
    // Giữ lại trạng thái checking cho các proxy chưa check
    checkedIds.slice(i + 1).forEach(id => {
      const proxy = state.proxies.find(p => p.id === id);
      if (proxy) proxy.status = 'checking';
    });
    renderProxyTable();
  }

  btn.disabled = false;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    Check proxy`;

  showToast(`Checked ${checkedIds.length} proxies!`, 'success');
});
function openBulkEditModal(ids) {
  // Reset type về HTTP
  const typeSelect = document.getElementById('bulkEditType');
  typeSelect.dataset.value = 'http';
  typeSelect.querySelector('.custom-select-label').textContent = 'HTTP';
  typeSelect.querySelectorAll('.custom-select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === 'http');
  });

  document.getElementById('bulkEditExpires').value = '';
  document.getElementById('bulkEditNote').value = '';
  initBulkTagSystem();
  if (window.resetBulkEditDate) resetBulkEditDate();
  document.getElementById('bulkEditModal').style.display = 'flex';
}
document.getElementById('btnCloseBulkEdit').addEventListener('click', () => {
  document.getElementById('bulkEditModal').style.display = 'none';
});
document.getElementById('bulkEditModalOverlay').addEventListener('click', () => {
  document.getElementById('bulkEditModal').style.display = 'none';
});
document.getElementById('btnCancelBulkEdit').addEventListener('click', () => {
  document.getElementById('bulkEditModal').style.display = 'none';
});

document.getElementById('btnSaveBulkEdit').addEventListener('click', async () => {
  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);
  if (!checkedIds.length) return;

  const type = document.getElementById('bulkEditType').dataset.value;
  const expires = document.getElementById('bulkEditExpires').value;
  const note = document.getElementById('bulkEditNote').value.trim();
  const tags = bulkTagState.selectedTags.length > 0
    ? JSON.stringify(bulkTagState.selectedTags)
    : null;

  for (const id of checkedIds) {
    const proxy = state.proxies.find(p => p.id === id);
    if (!proxy) continue;
    const updated = {
      ...proxy,
      type,
      expires: expires || proxy.expires,
      note: note || proxy.note,
      tag: tags !== null ? tags : proxy.tag
    };
    await msg('UPDATE_PROXY', updated);
  }

  state.proxies = await msg('GET_PROXIES') || [];
  bulkTagState.allTags.forEach(t => {
    if (!tagState.allTags.find(x => x.name === t.name)) {
      tagState.allTags.push(t);
    }
  });
  await saveTagHistory();

  document.getElementById('bulkEditModal').style.display = 'none';
  renderProxyTable();
  populateTagFilter();
  showToast(`Updated ${checkedIds.length} proxies!`, 'success');
});

let bulkTagState = {
  allTags: [],
  selectedTags: [],
  selectedColor: '#2fd7f0'
};


function initBulkTagSystem() {
  const input = document.getElementById('bulkEditTagInput');
  const createRow = document.getElementById('bulkEditTagCreateRow');
  const colorList = document.getElementById('bulkEditTagColorList');

  // Load tất cả tags từ proxies
  bulkTagState.allTags = [];
  state.proxies.forEach(p => {
    if (!p.tag) return;
    try {
      JSON.parse(p.tag).forEach(t => {
        if (!bulkTagState.allTags.find(x => x.name === t.name))
          bulkTagState.allTags.push(t);
      });
    } catch { }
  });

  // Merge thêm từ tagState.allTags (tag history)
  tagState.allTags.forEach(t => {
    if (!bulkTagState.allTags.find(x => x.name === t.name))
      bulkTagState.allTags.push(t);
  });

  bulkTagState.selectedTags = [];
  bulkTagState.selectedColor = '#2fd7f0';

  renderBulkSelectedTags();
  renderBulkTagList('');

  // Reset color dots
  colorList.querySelectorAll('.tag-color-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === 0);
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      colorList.querySelectorAll('.tag-color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      bulkTagState.selectedColor = dot.dataset.color;
      input.focus();
    });
  });

  // Input typing
  input.addEventListener('input', () => {
    const val = input.value.trim();
    const exists = bulkTagState.allTags.some(t => t.name.toLowerCase() === val.toLowerCase());
    if (val && !exists) {
      document.getElementById('bulkEditTagCreateName').textContent = val;
      createRow.style.display = 'flex';
    } else {
      createRow.style.display = 'none';
    }
    renderBulkTagList(val);
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (!val) return;
      const exists = bulkTagState.allTags.some(t => t.name.toLowerCase() === val.toLowerCase());
      if (!exists) {
        const newTag = { name: val, color: bulkTagState.selectedColor };
        bulkTagState.allTags.unshift(newTag);
        if (!tagState.allTags.find(t => t.name === newTag.name)) {
          tagState.allTags.unshift(newTag);
        }
        await saveTagHistory();
      }
      const tag = bulkTagState.allTags.find(t => t.name.toLowerCase() === val.toLowerCase());
      if (tag && !bulkTagState.selectedTags.find(t => t.name === tag.name))
        bulkTagState.selectedTags.push(tag);
      renderBulkSelectedTags();
      input.value = '';
      createRow.style.display = 'none';
      renderBulkTagList('');
    }
  });
}

function renderBulkTagList(search) {
  const tagList = document.getElementById('bulkEditTagList');
  const filtered = search
    ? bulkTagState.allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : bulkTagState.allTags;

  if (filtered.length === 0) {
    tagList.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-muted);text-align:center;">No tags found</div>`;
    return;
  }

  tagList.innerHTML = filtered.map(t => {
    const isSelected = bulkTagState.selectedTags.find(s => s.name === t.name);
    return `<div class="tag-list-item ${isSelected ? 'selected' : ''}" data-name="${t.name}" style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span>${t.name}</span>
      </div>
    </div>`;
  }).join('');

  tagList.querySelectorAll('.tag-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const tag = bulkTagState.allTags.find(t => t.name === item.dataset.name);
      if (!tag) return;
      const idx = bulkTagState.selectedTags.findIndex(t => t.name === tag.name);
      if (idx >= 0) bulkTagState.selectedTags.splice(idx, 1);
      else bulkTagState.selectedTags.push(tag);
      renderBulkSelectedTags();
      renderBulkTagList(document.getElementById('bulkEditTagInput').value.trim());
    });
  });
}

function renderBulkSelectedTags() {
  const list = document.getElementById('bulkEditTagSelectedList');
  list.innerHTML = bulkTagState.selectedTags.map(t => `
    <span class="tag-badge" style="background:${t.color};border:none;color:rgba(65,70,81,1);">
      ${t.name}
      <button class="tag-badge-remove" data-name="${t.name}" style="color:rgba(65,70,81,1);">×</button>
    </span>
  `).join('');

  list.querySelectorAll('.tag-badge-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      bulkTagState.selectedTags = bulkTagState.selectedTags.filter(t => t.name !== btn.dataset.name);
      renderBulkSelectedTags();
      renderBulkTagList(document.getElementById('bulkEditTagInput').value.trim());
    });
  });
}
function renderTagBadges(tagData) {
  if (!tagData) return '<span class="text-muted">—</span>';
  try {
    const tags = JSON.parse(tagData);
    if (!Array.isArray(tags) || tags.length === 0) return '<span class="text-muted">—</span>';
    return `<div style="display:flex;flex-wrap:wrap;gap:4px;">
      ${tags.map(t => `<span style="
        display:inline-flex;align-items:center;
        padding:2px 8px;border-radius:999px;
        font-size:11px;font-weight:400;
        background:${t.color};
        border:none;
        color:rgba(65,70,81,1);
        white-space:nowrap;
      ">${esc(t.name)}</span>`).join('')}
    </div>`;
  } catch {
    // fallback nếu tag cũ dạng string
    return `<span class="badge badge-inactive">${esc(tagData)}</span>`;
  }
}

function renderPagination(filteredCount) {
  const total = totalPages(filteredCount);
  const cur = state.currentPage;
  const container = document.getElementById('proxyPagination');

  if (total <= 1) { container.innerHTML = ''; return; }

  const pad = n => String(n).padStart(2, '0');
  const pageBtn = (n) => `<button class="btn-page ${n === cur ? 'active' : ''}" data-page="${n}">${pad(n)}</button>`;
  const dots = `<button class="btn-page dots" disabled>...</button>`;

  let pages = '';

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages += pageBtn(i);
  } else if (cur <= 4) {
    for (let i = 1; i <= 5; i++) pages += pageBtn(i);
    pages += dots;
    pages += pageBtn(total);
  } else if (cur >= total - 3) {
    pages += pageBtn(1);
    pages += dots;
    for (let i = total - 4; i <= total; i++) pages += pageBtn(i);
  } else {
    pages += pageBtn(1);
    pages += dots;
    pages += pageBtn(cur - 1);
    pages += pageBtn(cur);
    pages += pageBtn(cur + 1);
    pages += dots;
    pages += pageBtn(total);
  }

  container.innerHTML = `
    <button class="btn-page" data-page="prev" ${cur === 1 ? 'disabled' : ''}>‹</button>
    ${pages}
    <button class="btn-page" data-page="next" ${cur === total ? 'disabled' : ''}>›</button>
  `;
}

function formatProxyString(p, format) {
  if (!p.username) return `${p.host}:${p.port}`;
  if (format === 'host:port:user:pass') return `${p.host}:${p.port}:${p.username}${p.password ? ':' + p.password : ''}`;
  if (format === 'host:port@user:pass') return `${p.host}:${p.port}@${p.username}${p.password ? ':' + p.password : ''}`;
  if (format === 'user:pass:host:port') return `${p.username}${p.password ? ':' + p.password : ''}:${p.host}:${p.port}`;
  if (format === 'user:pass@host:port') return `${p.username}${p.password ? ':' + p.password : ''}@${p.host}:${p.port}`;
  return `${p.host}:${p.port}:${p.username}${p.password ? ':' + p.password : ''}`;
}

function openProxyModal(proxy) {
  state.editingProxyId = proxy ? proxy.id : null;
  const validateMsg = document.getElementById('proxyValidateMsg');
  if (validateMsg) validateMsg.textContent = '';
  document.getElementById('proxyModal').style.display = 'flex';
  document.querySelector('#proxyModal .modal-body').scrollTop = 0;
  setTimeout(() => {
    const modal = document.getElementById('proxyModal');
    modal.scrollTop = 0;
    const dialog = modal.querySelector('.modal-dialog');
    if (dialog) dialog.scrollTop = 0;
    const body = modal.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
  }, 0);
  document.getElementById('proxyModalTitle').textContent = proxy ? 'EDIT PROXY' : 'ADD NEW PROXY';
  resetTagSystem();

  if (proxy?.tag) {
    try {
      const proxyTags = JSON.parse(proxy.tag);
      proxyTags.forEach(t => {
        if (!tagState.allTags.find(x => x.name === t.name)) {
          tagState.allTags.unshift(t);
        }
        tagState.selectedTags.push(t);
      });
      renderSelectedTags();
      renderTagList('');
    } catch (e) { }
  }

  if (proxy?.expires && window.setSingleDate) {
    window.setSingleDate(proxy.expires);
  }

  const headerIconWrap = document.getElementById('proxyModalIconWrap');
  if (proxy) {
    headerIconWrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>`;
  } else {
    headerIconWrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>`;
  }
  const bulkLabel = document.getElementById('proxyBulkLabel');
  if (bulkLabel) bulkLabel.innerHTML = proxy ? 'EDIT THE PROXY HERE <span style="color:var(--danger)">*</span>' : 'ADD THE PROXIES HERE <span style="color:var(--danger)">*</span>';
  const bulk = document.getElementById('optProxyBulk');
  if (proxy) {
    bulk.rows = 1;
    bulk.classList.add('edit-mode');
    bulk.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); };
    bulk.onpaste = (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      bulk.value = text.split('\n')[0].trim();
    };
  } else {
    bulk.rows = 5;
    bulk.classList.remove('edit-mode');
    bulk.style.resize = '';
    bulk.style.overflowY = '';
    bulk.style.height = '';
    bulk.style.lineHeight = '';
    bulk.style.paddingTop = '';
    bulk.style.paddingBottom = '';
    bulk.style.whiteSpace = '';
    bulk.onkeydown = null;
    bulk.onpaste = null;
  }
  const saveBtn = document.getElementById('btnSaveProxyOpt');
  if (proxy) {
    saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg> Save`;
  } else {
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg> Add Proxy`;
  }

  document.getElementById('optProxyId').value = proxy?.id || '';
  const typeVal = proxy?.type || 'http';
  const typeSelect = document.getElementById('optProxyType');
  typeSelect.dataset.value = typeVal;
  typeSelect.querySelector('.custom-select-label').textContent = typeVal.toUpperCase();
  typeSelect.querySelectorAll('.custom-select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === typeVal);
  });

  const fmtVal = proxy?.inputFormat || 'host:port:user:pass';
  const fmtSelect = document.getElementById('optProxyInputFormat');
  fmtSelect.dataset.value = fmtVal;
  const fmtOpt = fmtSelect.querySelector(`.custom-select-option[data-value="${fmtVal}"]`);
  fmtSelect.querySelector('.custom-select-label').textContent = fmtOpt ? fmtOpt.textContent.trim() : fmtVal;
  fmtSelect.querySelectorAll('.custom-select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === fmtVal);
  });

  document.getElementById('optProxyExpires').value = proxy?.expires || '';
  bulk.value = proxy ? formatProxyString(proxy, fmtVal) : '';
  document.getElementById('optProxyNote').value = proxy?.note || '';
}

function closeProxyModal() {
  document.getElementById('proxyModal').style.display = 'none';
  state.editingProxyId = null;
  resetTagSystem();

}


async function saveProxy() {
  const id = state.editingProxyId;
  const type = document.getElementById('optProxyType').dataset.value;
  const inputFormat = document.getElementById('optProxyInputFormat').dataset.value;
  const bulk = document.getElementById('optProxyBulk').value.trim();
  const note = document.getElementById('optProxyNote').value.trim();
  const expires = document.getElementById('optProxyExpires').value;
  const tags = JSON.stringify(tagState.selectedTags.map(t => ({ name: t.name, color: t.color })));

  if (!bulk) {
    document.getElementById('proxyValidateMsg').textContent = 'Please enter at least 1 proxy.';
    document.getElementById('proxyValidateMsg').style.display = 'block';
    return;
  }

  const lines = bulk.split('\n').map(l => l.trim()).filter(Boolean);
  const parsed = [];
  const invalid = [];

  lines.forEach((line, i) => {
    const p = parseProxyLine(line, inputFormat);
    if (p) parsed.push(p);
    else invalid.push(i + 1);
  });

  if (invalid.length) {
    document.getElementById('proxyValidateMsg').textContent = `${invalid.length} line(s) have invalid proxy format`;
    document.getElementById('proxyValidateMsg').style.display = 'block';
    return;
  }

  document.getElementById('proxyValidateMsg').style.display = 'none';

  // ---- EDIT MODE ----
  if (id) {
    if (lines.length > 1) {
      document.getElementById('proxyValidateMsg').textContent = 'Only 1 proxy is allowed when editing.';
      document.getElementById('proxyValidateMsg').style.display = 'block';
      return;
    }
    const p = parsed[0];
    const existingProxy = state.proxies.find(x => x.id === id);
    await msg('UPDATE_PROXY', {
      ...existingProxy,
      id,
      type,
      inputFormat,
      host: p.host,
      port: p.port,
      username: p.username || '',
      password: p.password || '',
      tag: tags,
      note,
      expires,
      name: `${type.toUpperCase()} ${p.host}:${p.port}`
    });
    state.proxies = await msg('GET_PROXIES') || [];
    renderProxyTable();
    populateTagFilter();
    closeProxyModal();
    showToast('Proxy updated!');
    return;
  }

  // ---- ADD MODE ----
  const saveBtn = document.getElementById('btnSaveProxyOpt');
  saveBtn.disabled = true;
  saveBtn.style.width = 'auto';
  saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg> Adding ...`;

  // Add tất cả proxy
  for (const p of parsed) {
    const data = {
      type,
      inputFormat,
      host: p.host,
      port: p.port,
      username: p.username || '',
      password: p.password || '',
      tag: tags,
      note,
      expires,
      name: `${type.toUpperCase()} ${p.host}:${p.port}`
    };
    await msg('ADD_PROXY', data);
  }

  saveBtn.disabled = false;
  state.proxies = await msg('GET_PROXIES') || [];
  renderProxyTable();
  populateTagFilter();
  closeProxyModal();

  showToast(`Added ${parsed.length} proxy!`, 'success');
}
function parseProxyLine(line, format) {
  const p = line.split(':');
  const at = line.split('@');

  try {
    if (format === 'host:port') {
      if (p.length !== 2 || !p[0] || !+p[1]) return null;
      return { host: p[0], port: +p[1], username: '', password: '' };

    } else if (format === 'host:port:user:pass') {
      if (p.length < 4 || !p[0] || !+p[1] || !p[2] || !p[3]) return null;
      return { host: p[0], port: +p[1], username: p[2], password: p.slice(3).join(':') };

    } else if (format === 'host:port@user:pass') {
      if (at.length !== 2) return null;
      const hp = at[0].split(':');
      const up = at[1].split(':');
      if (!hp[0] || !+hp[1] || !up[0] || !up[1]) return null;
      return { host: hp[0], port: +hp[1], username: up[0], password: up[1] };

    } else if (format === 'user:pass:host:port') {
      if (p.length < 4 || !p[0] || !p[1] || !p[2] || !+p[3]) return null;
      return { host: p[2], port: +p[3], username: p[0], password: p[1] };

    } else if (format === 'user@pass:host:port') {
      if (at.length !== 2) return null;
      const hp = at[1].split(':');
      if (!at[0] || !hp[0] || !+hp[1]) return null;
      return { host: hp[0], port: +hp[1], username: at[0], password: '' };
    }
  } catch { return null; }
  return null;
}
async function deleteProxy(id) {
  await msg('REMOVE_PROXY', { id });
  state.proxies = await msg('GET_PROXIES') || [];
  if (state.currentPage > totalPages()) state.currentPage = totalPages();
  renderProxyTable();
  showToast('Proxy removed');
}

async function checkProxy(id) {
  const proxy = state.proxies.find(p => p.id === id);
  if (proxy) proxy.status = 'checking';
  renderProxyTable();

  const result = await msg('CHECK_PROXY', { id });
  state.proxies = await msg('GET_PROXIES') || [];
  renderProxyTable();
  showToast(result?.status === 'error' ? 'Proxy error!' : `IP: ${result?.ip || '?'}`);
}

async function pinProxy(id) {
  await msg('TOGGLE_PIN', { id });
  state.proxies = await msg('GET_PROXIES') || [];
  const proxy = state.proxies.find(p => p.id === id);
  renderProxyTable();
  showToast(proxy?.isPinned ? 'Pinned!' : 'Unpinned!');
}

async function copyProxy(id) {
  const proxy = state.proxies.find(p => p.id === id);
  if (!proxy) return;
  const str = proxy.username
    ? `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}`
    : `${proxy.host}:${proxy.port}`;
  await navigator.clipboard.writeText(str);
  showToast('Copied!');
}

function resolveTagColor(tagName) {
  const existing = tagState.allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
  if (existing) return existing.color;

  for (const proxy of state.proxies) {
    if (!proxy.tag) continue;
    try {
      const tags = JSON.parse(proxy.tag);
      const match = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
      if (match) return match.color;
    } catch (e) { }
  }
  return 'rgba(185,230,254,1)';
}

async function doImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const text = await file.text();
  const proxies = [];

  if (ext === 'json') {
    // Parse JSON export
    try {
      const arr = JSON.parse(text);
      arr.forEach(item => {
        if (!item.type || !item.proxy) return;
        const p = parseProxyLine(item.proxy, 'host:port:user:pass');
        if (!p) return;
        proxies.push({
          type: item.type.toLowerCase(),
          inputFormat: item.inputFormat || 'host:port:user:pass',
          host: p.host, port: p.port,
          username: p.username || '', password: p.password || '',
          tag: item.tag ? JSON.stringify(item.tag.split('/').map(n => ({ name: n.trim(), color: resolveTagColor(n.trim()) }))) : '',
          note: item.note || '',
          expires: item.expires || '',
          name: `${item.type} ${p.host}:${p.port}`
        });
      });
    } catch {
      showToast('Invalid JSON file!', 'error');
      return;
    }

    // SAU:
  } else if (ext === 'csv') {
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast('Empty CSV file!', 'error'); return; }
    const headers = lines[0].split(',').map(h => h.toLowerCase());
    const idxType = headers.indexOf('type');
    const idxProxy = headers.indexOf('proxy');
    const idxTag = headers.indexOf('tag');
    const idxNote = headers.indexOf('note');
    const idxExpires = headers.indexOf('expires');

    lines.slice(1).forEach(line => {
      const cols = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cols.push(cur.trim());
      const type = (cols[idxType] || 'http').toLowerCase();
      const proxyStr = cols[idxProxy] || '';
      const p = parseProxyLine(proxyStr, 'host:port:user:pass');
      if (!p) return;
      const tagName = idxTag >= 0 ? cols[idxTag] : '';
      proxies.push({
        type, inputFormat: 'host:port:user:pass', host: p.host, port: p.port,
        username: p.username || '', password: p.password || '',
        tag: tagName ? JSON.stringify(tagName.split('/').map(n => ({ name: n.trim(), color: resolveTagColor(n.trim()) }))) : '',
        note: idxNote >= 0 ? cols[idxNote] : '',
        expires: idxExpires >= 0 ? cols[idxExpires] : '',
        name: `${type.toUpperCase()} ${p.host}:${p.port}`
      });
    });

  } else if (ext === 'xlsx') {
    // Đọc file xlsx thật bằng SheetJS
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) { showToast('Empty XLSX file!', 'error'); return; }

    const headers = rows[0].map(h => String(h).toLowerCase());
    const idxType = headers.indexOf('type');
    const idxProxy = headers.indexOf('proxy');
    const idxTag = headers.indexOf('tag');
    const idxNote = headers.indexOf('note');
    const idxExpires = headers.indexOf('expires');

    rows.slice(1).forEach(cols => {
      const type = (String(cols[idxType] || 'http')).toLowerCase();
      const proxyStr = String(cols[idxProxy] || '');
      const p = parseProxyLine(proxyStr, 'host:port:user:pass');
      if (!p) return;
      const tagName = idxTag >= 0 ? String(cols[idxTag] || '') : '';
      proxies.push({
        type, inputFormat: 'host:port:user:pass', host: p.host, port: p.port,
        username: p.username || '', password: p.password || '',
        tag: tagName ? JSON.stringify(tagName.split('/').map(n => ({ name: n.trim(), color: resolveTagColor(n.trim()) }))) : '',
        note: idxNote >= 0 ? String(cols[idxNote] || '') : '',
        expires: idxExpires >= 0 ? String(cols[idxExpires] || '') : '',
        name: `${type.toUpperCase()} ${p.host}:${p.port}`
      });
    });

  } else {
    showToast('Unsupported file format!', 'error');
    return;
  }

  if (!proxies.length) { showToast('No valid proxies found!', 'warning'); return; }


  for (const p of proxies) {
    await msg('ADD_PROXY', p);
  }
  state.proxies = await msg('GET_PROXIES') || [];

  state.proxies.forEach(proxy => {
    if (!proxy.tag) return;
    try {
      JSON.parse(proxy.tag).forEach(t => {
        if (!tagState.allTags.find(x => x.name === t.name))
          tagState.allTags.push(t);
      });
    } catch { }
  });
  await saveTagHistory();
  populateTagFilter();

  renderProxyTable();
  showToast(`Imported ${proxies.length} proxies!`, 'success');
}

function bindRuleEvents() {
  // document.getElementById('btnAddRule').addEventListener('click', () => openRuleModal());
  document.getElementById('btnCloseRuleModal').addEventListener('click', closeRuleModal);
  document.getElementById('ruleModalOverlay').addEventListener('click', closeRuleModal);
  document.getElementById('btnCancelRule').addEventListener('click', closeRuleModal);
  document.getElementById('btnSaveRule').addEventListener('click', saveRule);

  // document.getElementById('btnPresetRules').addEventListener('click', async () => {
  //   const presets = await msg('GET_PRESET_RULES');
  //   for (const preset of presets) await msg('ADD_RULE', preset);
  //   state.rules = await msg('GET_RULES') || [];
  //   renderRulesList();
  //   showToast('Preset rules added!');
  // });
  // Auto Fill Bypass — nhấn là fill thẳng, không mở dialog
  document.getElementById('btnAutoFillBypass').addEventListener('click', () => {
    const current = document.getElementById('bypassList').value
      .split('\n').map(l => l.trim()).filter(Boolean);
    const merged = [...new Set([...current, ...DEFAULT_BYPASS_LIST])].filter(d => !isProtectedDomain(d));
    document.getElementById('bypassList').value = merged.join('\n');
    showToast(`Auto-filled ${DEFAULT_BYPASS_LIST.length} domains!`, 'success');
  });

  document.getElementById('btnImportBypass').addEventListener('click', () => {
    document.getElementById('bypassFileInput').click();
  });
  document.getElementById('bypassFileInput').addEventListener('change', handleBypassFileImport);
  document.getElementById('btnSaveBypass').addEventListener('click', saveBypassList);


  // let bypassTimer;
  // document.getElementById('bypassList').addEventListener('input', () => {
  //   clearTimeout(bypassTimer);
  //   bypassTimer = setTimeout(saveBypassList, 800);
  // });

  document.getElementById('rulesList').addEventListener('click', (e) => {
    let t = e.target;
    while (t && t !== document.getElementById('rulesList') && !t.dataset.action) {
      t = t.parentElement;
    }
    if (!t || !t.dataset.action) return;
    if (t.dataset.action === 'edit') openRuleModal(state.rules.find(r => r.id === t.dataset.id));
    if (t.dataset.action === 'delete') deleteRule(t.dataset.id);
  });

  document.getElementById('rulesList').addEventListener('change', (e) => {
    if (e.target.dataset.action === 'toggle') toggleRule(e.target.dataset.id, e.target.checked);
  });

  loadBypassList();
  document.getElementById('btnTabBypass').addEventListener('click', async () => {
    document.getElementById('btnTabBypass').classList.add('active');
    document.getElementById('btnTabDefault').classList.remove('active');
    document.getElementById('panelBypass').style.display = 'block';
    document.getElementById('panelDefault').style.display = 'none';
    document.getElementById('tabSwitchDesc').textContent = 'Bypass specific domains';
    setBypassPanelDisabled(false);

    state.settings.bypassMode = 'bypass';
    await msg('UPDATE_SETTINGS', state.settings);
  });

  document.getElementById('btnTabDefault').addEventListener('click', async () => {
    document.getElementById('btnTabDefault').classList.add('active');
    document.getElementById('btnTabBypass').classList.remove('active');
    document.getElementById('panelBypass').style.display = 'block';
    document.getElementById('panelDefault').style.display = 'none';
    document.getElementById('tabSwitchDesc').textContent = 'Apply for All';
    setBypassPanelDisabled(true);

    state.settings.bypassMode = 'default';
    await msg('UPDATE_SETTINGS', state.settings);
  });
}

const DEFAULT_BYPASS_LIST = [
  '*.fbcdn.net',
  '*.cdninstagram.com',
  '*.twimg.com',
  '*.pinimg.com',
  '*.redd.it',
  '*.redditmedia.com',
  '*.cloudfront.net',
  '*.akamaihd.net',
  '*.akamaized.net',
  '*.fastly.net',
  '*.cdn.cloudflare.net',
  '*.cloudflare.com',
  '*.imgur.com',
  '*.imageshack.us',
  '*.postimg.cc',
  '*.ibb.co',
  '*.flickr.com',
  '*.ytimg.com',
  '*.googlevideo.com',
  '*.vimeocdn.com',
  '*.alicdn.com',
  '*.taobao.com',
  '*.1688img.com',
  '*.ebayimg.com',
  '*.shopifycdn.com',
  '*.unsplash.com',
  '*.pexels.com',
  '*.pixabay.com'
];

async function loadBypassList() {
  const result = await msg('GET_SETTINGS');
  document.getElementById('bypassList').value =
    (result.bypassList && result.bypassList.length > 0)
      ? result.bypassList.join('\n')
      : '';
  if (result.bypassMode === 'default') {
    document.getElementById('btnTabDefault').classList.add('active');
    document.getElementById('btnTabBypass').classList.remove('active');
    document.getElementById('tabSwitchDesc').textContent = 'Apply for All';
    setBypassPanelDisabled(true);
  }
}
const PROTECTED_DOMAINS = [
  'hidemyacc.com',
  '*.hidemyacc.com',
];

function isProtectedDomain(domain) {
  return PROTECTED_DOMAINS.some(p =>
    domain === p || domain.toLowerCase().includes('hidemyacc.com')
  );
}

async function saveBypassList() {
  const text = document.getElementById('bypassList').value;
  const list = text.split('\n').map(l => l.trim()).filter(Boolean);
  const filtered = list.filter(d => !isProtectedDomain(d));
  state.settings.bypassList = filtered;
  await msg('UPDATE_SETTINGS', state.settings);
  showToast('Bypass list saved', 'success');
}

function setBypassPanelDisabled(disabled) {
  const textarea = document.getElementById('bypassList');
  const btnImport = document.getElementById('btnImportBypass');
  const btnSave = document.getElementById('btnSaveBypass');

  textarea.disabled = disabled;
  btnImport.disabled = disabled;
  btnSave.disabled = disabled;

  document.getElementById('panelBypass').style.opacity = disabled ? '0.5' : '1';
  document.getElementById('panelBypass').style.pointerEvents = disabled ? 'none' : '';
}

async function handleBypassFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const current = document.getElementById('bypassList').value.trim();
  const combined = current ? current + '\n' + text : text;
  const filteredCombined = combined.split('\n').map(l => l.trim())
    .filter(l => l && !isProtectedDomain(l)).join('\n');
  document.getElementById('bypassList').value = filteredCombined;
  await saveBypassList();
  e.target.value = '';
}

function renderRulesList() {
  const list = document.getElementById('rulesList');
  if (state.rules.length === 0) {
    list.innerHTML = `<div class="empty-state-large"><span>No rules configured</span><p>Add rules to route specific domains through different proxies.</p></div>`;
    return;
  }
  const sorted = [...state.rules].sort((a, b) => (a.priority || 100) - (b.priority || 100));
  list.innerHTML = sorted.map(r => `
    <div class="rule-item">
      <span class="rule-priority">#${r.priority || '-'}</span>
      <label class="switch" style="margin-right:4px;">
        <input type="checkbox" data-action="toggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
      <div class="rule-info">
        <div class="rule-name">${esc(r.name)}</div>
        <div class="rule-pattern">${r.matchType}: ${esc(r.pattern || 'combined')}</div>
      </div>
      <span class="rule-action-badge ${r.action}">${r.action}</span>
      <div class="rule-actions">
        <button class="btn-table" data-action="edit" data-id="${r.id}">Edit</button>
        <button class="btn-table delete" data-action="delete" data-id="${r.id}">Del</button>
      </div>
    </div>
  `).join('');
}

function openRuleModal(rule) {
  document.getElementById('ruleModal').style.display = 'flex';
  document.getElementById('ruleModalTitle').textContent = rule ? 'Edit Rule' : 'Add Rule';

  const proxySelect = document.getElementById('ruleProxyId');
  proxySelect.innerHTML = '<option value="">Default (Active Proxy)</option>';
  state.proxies.forEach(p => {
    proxySelect.innerHTML += `<option value="${p.id}" ${rule?.proxyId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
  });

  document.getElementById('ruleId').value = rule?.id || '';
  document.getElementById('ruleName').value = rule?.name || '';
  document.getElementById('rulePriority').value = rule?.priority || 10;
  document.getElementById('ruleMatchType').value = rule?.matchType || 'domain';
  document.getElementById('rulePattern').value = rule?.pattern || '';
  document.getElementById('ruleAction').value = rule?.action || 'direct';

  document.getElementById('ruleProxyGroup').style.display =
    (rule?.action || 'direct') === 'proxy' ? 'flex' : 'none';

  document.getElementById('ruleAction').onchange = (e) => {
    document.getElementById('ruleProxyGroup').style.display =
      e.target.value === 'proxy' ? 'flex' : 'none';
  };
}

function closeRuleModal() {
  document.getElementById('ruleModal').style.display = 'none';
}

async function saveRule() {
  const id = document.getElementById('ruleId').value;
  const data = {
    name: document.getElementById('ruleName').value.trim(),
    priority: parseInt(document.getElementById('rulePriority').value) || 10,
    matchType: document.getElementById('ruleMatchType').value,
    pattern: document.getElementById('rulePattern').value.trim(),
    action: document.getElementById('ruleAction').value,
    proxyId: document.getElementById('ruleProxyId').value || null,
    enabled: true
  };
  if (!data.name) data.name = data.pattern || 'Unnamed Rule';

  if (id) { data.id = id; await msg('UPDATE_RULE', data); }
  else { await msg('ADD_RULE', data); }

  state.rules = await msg('GET_RULES') || [];
  renderRulesList();
  closeRuleModal();
  showToast(id ? 'Rule updated!' : 'Rule added!');
}

async function deleteRule(id) {
  await msg('REMOVE_RULE', { id });
  state.rules = await msg('GET_RULES') || [];
  renderRulesList();
  showToast('Rule removed');
}

async function toggleRule(id, enabled) {
  await msg('UPDATE_RULE', { id, enabled });
  state.rules = await msg('GET_RULES') || [];
}

function bindSettingsEvents() {
  const map = [
    ['settWebrtc', 'webrtcProtection'],
    ['settTimezone', 'fakeTimezone'],
    ['settLanguage', 'fakeLanguage'],
    ['settLocation', 'fakeLocation']
  ];
  map.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', async (e) => {
      state.settings[key] = e.target.checked;
      await msg('UPDATE_SETTINGS', state.settings);
      // showToast('Settings saved');
    });
  });
}

function loadSettingsUI() {
  document.getElementById('settWebrtc').checked = state.settings.webrtcProtection !== false;
  document.getElementById('settTimezone').checked = state.settings.fakeTimezone === true;
  document.getElementById('settLanguage').checked = state.settings.fakeLanguage === true;
  document.getElementById('settLocation').checked = state.settings.fakeLocation === true;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showToast(message, type = 'success', sub = '') {
  // Tạo container nếu chưa có
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Icon theo type
  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>`
  };

  const toast = document.createElement('div');
  toast.className = `toast${type !== 'success' ? ` toast-${type}` : ''}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.success}</div>
    <div class="toast-body">
      <div class="toast-title">${message}</div>
      ${sub ? `<div class="toast-sub">${sub}</div>` : ''}
    </div>
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('show'));

  // Auto remove
  const timer = setTimeout(() => removeToast(toast), 3000);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    clearTimeout(timer);
    removeToast(toast);
  });
}

function removeToast(toast) {
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 300);
}

(function () {
  let drpFromDate = null;
  let drpToDate = null;
  let drpTempFrom = null;
  let drpTempTo = null;
  let drpViewYear = new Date().getFullYear();
  let drpViewMonth = new Date().getMonth();
  let drpSelecting = 0;
  window.getDrpDates = function () {
    return { from: drpFromDate, to: drpToDate };
  };

  const input = document.getElementById('dateRangeInput');
  const popup = document.getElementById('dateRangePopup');
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
    document.getElementById('tagFilterDropdown').style.display = 'none';  // thêm
    document.getElementById('tagFilterTrigger').classList.remove('active');
    const isOpen = popup.style.display !== 'none';
    popup.style.display = isOpen ? 'none' : 'block';
    input.classList.toggle('active', !isOpen);
    if (!isOpen) {
      drpTempFrom = drpFromDate;
      drpTempTo = drpToDate;
      drpSelecting = drpTempFrom ? 1 : 0;
      drpRender();
    }

  });

  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && e.target !== input) {
      popup.style.display = 'none';
      input.classList.remove('active');
    }
  });

  document.getElementById('drpPrevMonth').addEventListener('click', () => {
    drpViewMonth--;
    if (drpViewMonth < 0) { drpViewMonth = 11; drpViewYear--; }
    drpRender();
  });

  document.getElementById('drpNextMonth').addEventListener('click', () => {
    drpViewMonth++;
    if (drpViewMonth > 11) { drpViewMonth = 0; drpViewYear++; }
    drpRender();
  });

  document.getElementById('drpCancel').addEventListener('click', () => {
    drpFromDate = null;
    drpToDate = null;
    drpTempFrom = null;
    drpTempTo = null;
    popup.style.display = 'none';
    input.classList.remove('active');
    drpUpdateInput();
    state.currentPage = 1;
    renderProxyTable();
  });

  document.getElementById('drpApply').addEventListener('click', () => {
    drpFromDate = drpTempFrom;
    drpToDate = drpTempTo;
    popup.style.display = 'none';
    input.classList.remove('active');
    drpUpdateInput();
    state.currentPage = 1;
    renderProxyTable();
  });

  function drpRender() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('drpMonthLabel').textContent = `${months[drpViewMonth]} ${drpViewYear}`;

    const fmt = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—';
    document.getElementById('drpFromVal').textContent = fmt(drpTempFrom);
    document.getElementById('drpToVal').textContent = fmt(drpTempTo);

    const firstDay = new Date(drpViewYear, drpViewMonth, 1).getDay();
    const daysInMonth = new Date(drpViewYear, drpViewMonth + 1, 0).getDate();
    const daysInPrev = new Date(drpViewYear, drpViewMonth, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let html = '';
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<button class="drp-day other-month" disabled>${daysInPrev - i}</button>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(drpViewYear, drpViewMonth, d);
      let cls = 'drp-day';
      if (date.getTime() === today.getTime()) cls += ' today';
      if (drpTempFrom && date.getTime() === drpTempFrom.getTime()) cls += ' range-start';
      else if (drpTempTo && date.getTime() === drpTempTo.getTime()) cls += ' range-end';
      else if (drpTempFrom && drpTempTo && date > drpTempFrom && date < drpTempTo) cls += ' in-range';
      html += `<button class="${cls}" data-date="${date.toISOString()}">${d}</button>`;
    }
    const remaining = 42 - firstDay - daysInMonth;
    for (let d = 1; d <= remaining; d++) {
      html += `<button class="drp-day other-month" disabled>${d}</button>`;
    }
    document.getElementById('drpDays').innerHTML = html;

    document.getElementById('drpDays').querySelectorAll('.drp-day:not(.other-month)').forEach(btn => {
      btn.addEventListener('click', () => {
        const clicked = new Date(btn.dataset.date);
        if (!drpTempFrom || drpSelecting === 0) {
          drpTempFrom = clicked;
          drpTempTo = null;
          drpSelecting = 1;
        } else if (drpSelecting === 1) {
          if (clicked < drpTempFrom) {
            drpTempTo = drpTempFrom;
            drpTempFrom = clicked;
          } else {
            drpTempTo = clicked;
          }
          drpSelecting = 0;
        }
        drpRender();
      });
    });
  }

  function drpUpdateInput() {
    const fmt = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : 'mm/dd/yyyy';
    document.getElementById('dateRangeText').textContent = `${fmt(drpFromDate)} — ${fmt(drpToDate)}`;
    if (drpFromDate) document.getElementById('dateRangeText').style.color = 'var(--text-primary)';
  }



})();
// Custom Select UI
function initCustomSelects() {
  document.querySelectorAll('.custom-select').forEach(sel => {
    const trigger = sel.querySelector('.custom-select-trigger');
    const dropdown = sel.querySelector('.custom-select-dropdown');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('tagFilterDropdown').style.display = 'none';
      document.getElementById('tagFilterTrigger').classList.remove('active');
      document.getElementById('dateRangePopup').style.display = 'none';
      document.getElementById('dateRangeInput').classList.remove('active');
      const isOpen = sel.classList.contains('open');
      document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
      if (!isOpen) sel.classList.add('open');
    });

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.custom-select-option');
      if (!opt) return;
      dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      sel.querySelector('.custom-select-label').textContent = opt.textContent;
      sel.dataset.value = opt.dataset.value;
      sel.classList.remove('open');
      sel.dispatchEvent(new Event('custom-change'));
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
  });
}
function doExport() {
  const fileFormat = document.getElementById('exportFileFormat').dataset.value;
  const proxyFormat = document.getElementById('exportProxyFormat').dataset.value;
  const includeTag = document.getElementById('exportIncludeTag').checked;
  const includeNote = document.getElementById('exportIncludeNote').checked;
  const includeExpires = document.getElementById('exportIncludeExpires').checked;

  const checkedIds = [...document.querySelectorAll('#proxyTableBody .row-checkbox:checked')]
    .map(cb => cb.dataset.id);

  if (!checkedIds.length) { showToast('Please select at least 1 proxy!', 'warning'); return; }

  const proxies = state.proxies.filter(p => checkedIds.includes(p.id));

  function formatProxy(p) {
    let proxyStr = '';
    if (proxyFormat === 'host:port:user:pass')
      proxyStr = `${p.host}:${p.port}${p.username ? ':' + p.username + ':' + p.password : ''}`;
    else if (proxyFormat === 'host:port@user:pass')
      proxyStr = `${p.host}:${p.port}${p.username ? '@' + p.username + ':' + p.password : ''}`;
    else if (proxyFormat === 'user:pass:host:port')
      proxyStr = `${p.username ? p.username + ':' + p.password + ':' : ''}${p.host}:${p.port}`;
    else if (proxyFormat === 'user@pass:host:port')
      proxyStr = `${p.username ? p.username + '@' + p.password + ':' : ''}${p.host}:${p.port}`;
    return proxyStr;
  }

  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  let content = '';
  let filename = '';
  let mimeType = 'text/plain;charset=utf-8';

  function formatTag(tagData) {
    if (!tagData) return '';
    try {
      const tags = JSON.parse(tagData);
      return tags.map(t => t.name).join('/');
    } catch {
      return tagData;
    }
  }

  if (fileFormat === 'csv') {
    const headers = ['Type', 'Proxy'];
    if (includeTag) headers.push('Tag');
    if (includeNote) headers.push('Note');
    if (includeExpires) headers.push('Expires');
    const rows = proxies.map(p => {
      const cols = [p.type.toUpperCase(), formatProxy(p)];
      if (includeTag) cols.push(formatTag(p.tag));
      if (includeNote) cols.push(p.note || '');
      if (includeExpires) cols.push(p.expires || '');
      return cols.map(c => `"${c}"`).join(',');
    });
    content = [headers.join(','), ...rows].join('\n');
    filename = `proxies_${timestamp}.csv`;
    mimeType = 'text/csv;charset=utf-8';

  } else if (fileFormat === 'excel') {
    const headers = ['Type', 'Proxy'];
    if (includeTag) headers.push('Tag');
    if (includeNote) headers.push('Note');
    if (includeExpires) headers.push('Expires');

    const rows = proxies.map(p => {
      const row = [p.type.toUpperCase(), formatProxy(p)];
      if (includeTag) row.push(formatTag(p.tag));
      if (includeNote) row.push(p.note || '');
      if (includeExpires) row.push(p.expires || '');
      return row;
    });

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proxies');
    XLSX.writeFile(wb, `proxies_${timestamp}.xlsx`);

    document.getElementById('exportModal').style.display = 'none';
    showToast(`Exported ${proxies.length} proxies!`, 'success');
    return; // return sớm vì XLSX.writeFile tự download
  } else if (fileFormat === 'json') {
    const data = proxies.map(p => {
      const obj = { type: p.type, proxy: formatProxy(p) };
      if (includeTag) obj.tag = formatTag(p.tag);
      if (includeNote) obj.note = p.note || '';
      if (includeExpires) obj.expires = p.expires || '';
      return obj;
    });
    content = JSON.stringify(data, null, 2);
    filename = `proxies_${timestamp}.json`;
    mimeType = 'application/json;charset=utf-8';
  }

  // Download file
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  document.getElementById('exportModal').style.display = 'none';
  showToast(`Exported ${proxies.length} proxies!`, 'success');
}

// TAG SYSTEM
const TAG_COLORS = ['#2fd7f0', '#a78bfa', '#f472b6', '#fb923c', '#4ade80', '#facc15', '#60a5fa'];

let tagState = {
  allTags: [],
  selectedTags: [],
  selectedColor: TAG_COLORS[0]
};
async function loadTagHistory() {
  return new Promise((resolve) => {
    api.storage.local.get('tagHistory', (result) => {
      tagState.allTags = result.tagHistory || [];
      resolve();
    });
  });
}

async function saveTagHistory() {
  return new Promise((resolve) => {
    api.storage.local.set({ tagHistory: tagState.allTags }, resolve);
  });
}
function initTagSystem() {
  const input = document.getElementById('tagSearchInput');
  const createRow = document.getElementById('tagCreateRow');
  const colorList = document.getElementById('tagColorList');

  // Render list ngay khi init
  renderTagList('');

  // Color dots
  colorList.querySelectorAll('.tag-color-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      colorList.querySelectorAll('.tag-color-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      tagState.selectedColor = dot.dataset.color;
      document.getElementById('tagSearchInput').focus();
    });
  });

  // Input typing
  input.addEventListener('input', () => {
    const val = input.value.trim();
    const exactMatch = tagState.allTags.some(t => t.name.toLowerCase() === val.toLowerCase());

    if (val && !exactMatch) {
      document.getElementById('tagCreateName').textContent = val;
      createRow.style.display = 'flex';
    } else {
      createRow.style.display = 'none';
    }

    renderTagList(val);
  });

  // Enter to create/select
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (!val) return;
      const exactMatch = tagState.allTags.some(t => t.name.toLowerCase() === val.toLowerCase());
      if (!exactMatch) {
        const newTag = { name: val, color: tagState.selectedColor };
        tagState.allTags.unshift(newTag);
        await saveTagHistory();
      }
      const tag = tagState.allTags.find(t => t.name.toLowerCase() === val.toLowerCase());
      if (tag && !tagState.selectedTags.find(t => t.name === tag.name)) {
        tagState.selectedTags.push(tag);
        renderSelectedTags();
      }
      input.value = '';
      createRow.style.display = 'none';
      renderTagList('');
    }
    if (e.key === 'Escape') {
      input.value = '';
      createRow.style.display = 'none';
      renderTagList('');
    }
  });
}

function renderTagList(search) {
  const tagList = document.getElementById('tagList');
  if (!Array.isArray(tagState.allTags)) tagState.allTags = [];

  const filtered = search
    ? tagState.allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tagState.allTags;

  if (filtered.length === 0) {
    tagList.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--text-muted);text-align:center;">No tags found</div>`;
    return;
  }

  tagList.innerHTML = filtered.map(t => {
    const isSelected = tagState.selectedTags.find(s => s.name === t.name);
    return `<div class="tag-list-item ${isSelected ? 'selected' : ''}" data-name="${t.name}" style="display:flex;align-items:center;justify-content:space-between;">
      <span>${esc(t.name)}</span>
      <button class="tag-delete-btn" data-name="${t.name}" style="background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-muted);font-size:14px;line-height:1;border-radius:3px;flex-shrink:0;" title="Delete tag">×</button>
    </div>`;
  }).join('');

  // Click vào item => select/deselect
  tagList.querySelectorAll('.tag-list-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tag-delete-btn')) return; // bỏ qua nếu click nút ×
      const tag = tagState.allTags.find(t => t.name === item.dataset.name);
      if (!tag) return;
      const idx = tagState.selectedTags.findIndex(t => t.name === tag.name);
      if (idx >= 0) tagState.selectedTags.splice(idx, 1);
      else tagState.selectedTags.push(tag);
      renderSelectedTags();
      renderTagList(document.getElementById('tagSearchInput').value.trim());
    });
  });

  tagList.querySelectorAll('.tag-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;

      tagState.allTags = tagState.allTags.filter(t => t.name !== name);
      tagState.selectedTags = tagState.selectedTags.filter(t => t.name !== name);
      await saveTagHistory();

      for (const proxy of state.proxies) {
        if (!proxy.tag) continue;
        try {
          const tags = JSON.parse(proxy.tag);
          const hasTag = tags.some(t => t.name === name);
          if (!hasTag) continue;
          const updatedTags = tags.filter(t => t.name !== name);
          await msg('UPDATE_PROXY', { ...proxy, tag: JSON.stringify(updatedTags) });
        } catch { }
      }

      state.proxies = await msg('GET_PROXIES') || [];
      renderProxyTable();
      populateTagFilter();

      renderSelectedTags();
      renderTagList(document.getElementById('tagSearchInput').value.trim());
    });
  });
}

function renderSelectedTags() {
  const list = document.getElementById('tagSelectedList');
  list.innerHTML = tagState.selectedTags.map(t => `
    <span class="tag-badge" style="background:${t.color};border:none;color:rgba(65,70,81,1);">
      ${esc(t.name)}
      <button class="tag-badge-remove" data-name="${t.name}" style="color:rgba(65,70,81,1);">×</button>
    </span>
  `).join('');

  list.querySelectorAll('.tag-badge-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      tagState.selectedTags = tagState.selectedTags.filter(t => t.name !== btn.dataset.name);
      renderSelectedTags();
      renderTagList(document.getElementById('tagSearchInput').value.trim());
    });
  });
}

function resetTagSystem() {
  tagState.selectedTags = [];
  tagState.selectedColor = TAG_COLORS[0];
  renderSelectedTags();
  renderTagList('');
  const input = document.getElementById('tagSearchInput');
  if (input) input.value = '';
  const createRow = document.getElementById('tagCreateRow');
  if (createRow) createRow.style.display = 'none';
  const colorList = document.getElementById('tagColorList');
  if (colorList) {
    colorList.querySelectorAll('.tag-color-dot').forEach((d, i) => {
      d.classList.toggle('active', i === 0);
    });
  }
  if (window.resetSingleDate) resetSingleDate();
}
// Single Date Picker
(function () {
  let sdSelectedDate = null;
  let sdTempDate = null;
  let sdViewYear = new Date().getFullYear();
  let sdViewMonth = new Date().getMonth();

  const input = document.getElementById('singleDateInput');
  const popup = document.getElementById('singleDatePopup');
  if (!input || !popup) return;

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = popup.style.display !== 'none';
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
    popup.style.display = isOpen ? 'none' : 'block';
    input.classList.toggle('active', !isOpen);
    if (!isOpen) {
      sdTempDate = sdSelectedDate;
      sdRender();
    }
  });

  popup.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('singleDateWrap');
    if (wrap && !wrap.contains(e.target)) {
      popup.style.display = 'none';
      input.classList.remove('active');
    }
  });

  document.getElementById('sdPrevMonth').addEventListener('click', () => {
    sdViewMonth--;
    if (sdViewMonth < 0) { sdViewMonth = 11; sdViewYear--; }
    sdRender();
  });

  document.getElementById('sdNextMonth').addEventListener('click', () => {
    sdViewMonth++;
    if (sdViewMonth > 11) { sdViewMonth = 0; sdViewYear++; }
    sdRender();
  });

  document.getElementById('sdCancel').addEventListener('click', () => {
    popup.style.display = 'none';
    input.classList.remove('active');
  });

  document.getElementById('sdApply').addEventListener('click', () => {
    sdSelectedDate = sdTempDate;
    popup.style.display = 'none';
    input.classList.remove('active');
    sdUpdateInput();
  });

  function sdRender() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('sdMonthLabel').textContent = `${months[sdViewMonth]} ${sdViewYear}`;

    const firstDay = new Date(sdViewYear, sdViewMonth, 1).getDay();
    const daysInMonth = new Date(sdViewYear, sdViewMonth + 1, 0).getDate();
    const daysInPrev = new Date(sdViewYear, sdViewMonth, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let html = '';
    for (let i = firstDay - 1; i >= 0; i--)
      html += `<button class="drp-day other-month" disabled>${daysInPrev - i}</button>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(sdViewYear, sdViewMonth, d);
      let cls = 'drp-day';
      if (date.getTime() === today.getTime()) cls += ' today';
      if (sdTempDate && date.getTime() === sdTempDate.getTime()) cls += ' range-start range-end';
      html += `<button class="${cls}" data-date="${date.toISOString()}">${d}</button>`;
    }
    const remaining = 42 - firstDay - daysInMonth;
    for (let d = 1; d <= remaining; d++)
      html += `<button class="drp-day other-month" disabled>${d}</button>`;

    const daysEl = document.getElementById('sdDays');
    daysEl.innerHTML = html;
    daysEl.querySelectorAll('.drp-day:not(.other-month)').forEach(btn => {
      btn.addEventListener('click', () => {
        sdTempDate = new Date(btn.dataset.date);
        sdRender();
      });
    });
  }

  function sdUpdateInput() {
    const fmt = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : 'mm/dd/yyyy';
    document.getElementById('singleDateText').textContent = fmt(sdSelectedDate);
    document.getElementById('optProxyExpires').value = sdSelectedDate ? toLocalDateStr(sdSelectedDate) : '';
  }

  window.resetSingleDate = function () {
    sdSelectedDate = null;
    sdTempDate = null;
    sdViewYear = new Date().getFullYear();
    sdViewMonth = new Date().getMonth();
    document.getElementById('singleDateText').textContent = 'mm/dd/yyyy';
    document.getElementById('optProxyExpires').value = '';
    popup.style.display = 'none';
    input.classList.remove('active');
  };

  window.setSingleDate = function (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return;
    sdSelectedDate = d;
    sdTempDate = d;
    sdViewYear = d.getFullYear();
    sdViewMonth = d.getMonth();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    document.getElementById('singleDateText').textContent = `${day}/${month}/${year}`;
    document.getElementById('optProxyExpires').value = dateStr;
  };
})();

// MORE MENU
(function () {
  let currentProxyId = null;
  const menu = document.getElementById('moreMenu');

  // Mở menu
  document.getElementById('proxyTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="more"]');
    if (!btn) return;
    e.stopPropagation();

    currentProxyId = btn.dataset.id;
    const proxy = state.proxies.find(p => p.id === currentProxyId);

    // Pin/Unpin text
    document.getElementById('moreMenuPinText').textContent = proxy?.isPinned ? 'Unpin' : 'Pin';
    document.querySelector('#moreMenuPin svg').outerHTML = proxy?.isPinned
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"/>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
      <line x1="3" y1="3" x2="21" y2="21"/>
    </svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"/>
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
    </svg>`;

    // Vị trí menu
    const rect = btn.getBoundingClientRect();
    menu.style.display = 'block';
    const menuH = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < menuH) {
      menu.style.top = (rect.top - menuH + window.scrollY) + 'px';
    } else {
      menu.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    }
    menu.style.left = (rect.right - menu.offsetWidth) + 'px';
  });

  // Đóng menu khi click ngoài
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) {
      menu.style.display = 'none';
      currentProxyId = null;
    }
  });

  document.getElementById('moreMenuCheck').addEventListener('click', async () => {
    menu.style.display = 'none';
    if (currentProxyId) await checkProxy(currentProxyId);
  });

  document.getElementById('moreMenuCopy').addEventListener('click', async () => {
    menu.style.display = 'none';
    if (currentProxyId) await copyProxy(currentProxyId);
  });

  document.getElementById('moreMenuEdit').addEventListener('click', () => {
    menu.style.display = 'none';
    if (currentProxyId) openProxyModal(state.proxies.find(p => p.id === currentProxyId));
  });

  document.getElementById('moreMenuPin').addEventListener('click', async () => {
    menu.style.display = 'none';
    if (currentProxyId) await pinProxy(currentProxyId);
  });

  document.getElementById('moreMenuDelete').addEventListener('click', () => {
    menu.style.display = 'none';
    if (currentProxyId) showDeleteConfirm(currentProxyId);
  });
})();

document.getElementById('btnThemeLight').addEventListener('click', () => {
  document.documentElement.setAttribute('data-theme', 'light');
  document.getElementById('logoImg').src = '../../icons/ic-logo-light.png';
  document.getElementById('btnThemeLight').classList.add('active');
  document.getElementById('btnThemeDark').classList.remove('active');
  chrome.storage.local.set({ theme: 'light' });
  localStorage.setItem('proxyguard_theme', 'light');
  renderProxyTable();
});

document.getElementById('btnThemeDark').addEventListener('click', () => {
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('logoImg').src = '../../icons/ic-logo-light.png';
  document.getElementById('btnThemeDark').classList.add('active');
  document.getElementById('btnThemeLight').classList.remove('active');
  chrome.storage.local.set({ theme: 'dark' });
  localStorage.setItem('proxyguard_theme', 'dark');
  renderProxyTable();
});

// SAU
chrome.storage.local.get('theme', (data) => {
  const savedTheme = data.theme || 'light'; // mặc định light
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('logoImg').src = '../../icons/ic-logo-light.png';
    document.getElementById('btnThemeLight').classList.add('active');
    document.getElementById('btnThemeDark').classList.remove('active');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('logoImg').src = '../../icons/ic-logo-light.png';
    document.getElementById('btnThemeDark').classList.add('active');
    document.getElementById('btnThemeLight').classList.remove('active');
  }
});
// Inline note editing
document.getElementById('proxyTableBody').addEventListener('click', (e) => {
  const cell = e.target.closest('.note-cell');
  if (!cell) return;
  const display = cell.querySelector('.note-display');
  const input = cell.querySelector('.note-input');
  if (input.style.display !== 'none') return;

  display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
});

document.getElementById('proxyTableBody').addEventListener('focusout', async (e) => {
  if (!e.target.classList.contains('note-input')) return;
  await saveNoteInline(e.target);
});

document.getElementById('proxyTableBody').addEventListener('keydown', async (e) => {
  if (!e.target.classList.contains('note-input')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    await saveNoteInline(e.target);
  }
  if (e.key === 'Escape') {
    const cell = e.target.closest('.note-cell');
    e.target.style.display = 'none';
    cell.querySelector('.note-display').style.display = 'block';
  }
});

async function saveNoteInline(input) {
  const id = input.dataset.id;
  const note = input.value.trim();
  const proxy = state.proxies.find(p => p.id === id);
  if (!proxy) return;

  await msg('UPDATE_PROXY', { ...proxy, id, note });
  state.proxies = await msg('GET_PROXIES') || [];
  renderProxyTable();
}

(function () {
  let pendingDeleteIds = [];

  document.getElementById('deleteModalOverlay').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteIds = [];
  });

  document.getElementById('btnCancelDelete').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
    pendingDeleteIds = [];
  });

  document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
    document.getElementById('deleteModal').style.display = 'none';
    for (const id of pendingDeleteIds) {
      await msg('REMOVE_PROXY', { id });
    }
    state.proxies = await msg('GET_PROXIES') || [];

    const remainingIds = new Set(state.proxies.map(p => p.id));
    chrome.storage.local.get('recentProxyIds', (data) => {
      const cleaned = (data.recentProxyIds || []).filter(id => remainingIds.has(id));
      chrome.storage.local.set({ recentProxyIds: cleaned });
    });

    if (state.currentPage > totalPages()) state.currentPage = totalPages();
    renderProxyTable();
    showToast(`Deleted ${pendingDeleteIds.length} proxy!`, 'success');
    pendingDeleteIds = [];
  });

  window.showDeleteConfirm = function (ids) {
    pendingDeleteIds = Array.isArray(ids) ? ids : [ids];
    document.querySelector('.delete-desc').textContent = pendingDeleteIds.length > 1
      ? `Are you sure you want to delete ${pendingDeleteIds.length} proxies? This action cannot be undone.`
      : 'Are you sure you want to delete this proxy? This action cannot be undone.';
    document.getElementById('deleteModal').style.display = 'flex';
  };
})();

(function () {
  let bdSelectedDate = null;
  let bdTempDate = null;
  let bdViewYear = new Date().getFullYear();
  let bdViewMonth = new Date().getMonth();

  const input = document.getElementById('bulkEditDateInput');
  const popup = document.getElementById('bulkEditDatePopup');
  if (!input || !popup) return;

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = popup.style.display !== 'none';
    popup.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) { bdTempDate = bdSelectedDate; bdRender(); }
  });

  popup.addEventListener('click', e => e.stopPropagation());

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('bulkEditDateWrap');
    if (wrap && !wrap.contains(e.target)) popup.style.display = 'none';
  });

  document.getElementById('bulkEditDatePrev').addEventListener('click', () => {
    bdViewMonth--;
    if (bdViewMonth < 0) { bdViewMonth = 11; bdViewYear--; }
    bdRender();
  });

  document.getElementById('bulkEditDateNext').addEventListener('click', () => {
    bdViewMonth++;
    if (bdViewMonth > 11) { bdViewMonth = 0; bdViewYear++; }
    bdRender();
  });

  document.getElementById('bulkEditDateCancel').addEventListener('click', () => {
    popup.style.display = 'none';
  });

  document.getElementById('bulkEditDateApply').addEventListener('click', () => {
    bdSelectedDate = bdTempDate;
    popup.style.display = 'none';
    bdUpdateInput();
  });

  function bdRender() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('bulkEditDateMonthLabel').textContent = `${months[bdViewMonth]} ${bdViewYear}`;

    const firstDay = new Date(bdViewYear, bdViewMonth, 1).getDay();
    const daysInMonth = new Date(bdViewYear, bdViewMonth + 1, 0).getDate();
    const daysInPrev = new Date(bdViewYear, bdViewMonth, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    let html = '';
    for (let i = firstDay - 1; i >= 0; i--)
      html += `<button class="drp-day other-month" disabled>${daysInPrev - i}</button>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(bdViewYear, bdViewMonth, d);
      let cls = 'drp-day';
      if (date.getTime() === today.getTime()) cls += ' today';
      if (bdTempDate && date.getTime() === bdTempDate.getTime()) cls += ' range-start range-end';
      html += `<button class="${cls}" data-date="${date.toISOString()}">${d}</button>`;
    }
    const remaining = 42 - firstDay - daysInMonth;
    for (let d = 1; d <= remaining; d++)
      html += `<button class="drp-day other-month" disabled>${d}</button>`;

    const daysEl = document.getElementById('bulkEditDateDays');
    daysEl.innerHTML = html;
    daysEl.querySelectorAll('.drp-day:not(.other-month)').forEach(btn => {
      btn.addEventListener('click', () => {
        bdTempDate = new Date(btn.dataset.date);
        bdRender();
      });
    });
  }

  function bdUpdateInput() {
    const fmt = d => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : 'mm/dd/yyyy';
    document.getElementById('bulkEditDateText').textContent = fmt(bdSelectedDate);
    document.getElementById('bulkEditExpires').value = bdSelectedDate ? toLocalDateStr(bdSelectedDate) : '';
  }

  // Reset khi mở modal
  window.resetBulkEditDate = function () {
    bdSelectedDate = null;
    bdTempDate = null;
    bdViewYear = new Date().getFullYear();
    bdViewMonth = new Date().getMonth();
    document.getElementById('bulkEditDateText').textContent = 'mm/dd/yyyy';
    document.getElementById('bulkEditExpires').value = '';
    popup.style.display = 'none';
  };
})();