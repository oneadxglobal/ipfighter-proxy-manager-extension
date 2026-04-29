const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

let state = {
  enabled: false,
  proxies: [],
  activeProxyId: null,
  ipInfo: null,
  currentTab: 'manager',
  currentView: 'list',
  editingId: null,
  recentIds: [],
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  bindEvents();
});

async function loadState() {
  try {
    const status = await sendMessage('GET_STATUS');
    state.enabled = status.extensionEnabled !== false;
    state.activeProxyId = (status.proxy && status.enabled && status.info) ? status.proxy.id : null;
    state.ipInfo = status.info || null;

    if (!state.ipInfo) {
      const realIp = await sendMessage('GET_REAL_IP');
      state.ipInfo = realIp || null;
    }

    state.proxies = await sendMessage('GET_PROXIES') || [];
    const stored = await new Promise(r => chrome.storage.local.get('recentProxyIds', r));
    state.recentIds = stored.recentProxyIds || [];
  } catch (e) {
    console.warn('loadState:', e.message);
  }
  const themeData = await new Promise(r => chrome.storage.local.get('theme', r));
  if (themeData.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  render();
}

function sendMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage({ type, data }, (res) => {
      if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
      else resolve(res);
    });
  });
}

function bindEvents() {

  document.getElementById('proxyToggle').addEventListener('change', handleToggle);


  document.getElementById('btnAddProxyEmpty').addEventListener('click', () => showView('form'));


  document.getElementById('btnAddProxySm').addEventListener('click', () => showView('form'));


  document.getElementById('btnBack').addEventListener('click', () => showView(state.proxies.length ? 'list' : 'empty'));
  document.getElementById('btnSubmit').addEventListener('click', handleSubmitForm);


  document.getElementById('searchInput').addEventListener('input', renderProxyList);


  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.currentTab = tab.dataset.tab;
      document.querySelectorAll('.tab[data-tab]').forEach(t => {
        t.classList.remove('active');
        t.innerHTML = t.dataset.label;
      });
      tab.classList.add('active');
      tab.innerHTML = `<span class="tab-arrow">▶</span>${tab.dataset.label}`;
      renderProxyList();
    });
  });


  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn[data-page]').forEach(b => b.classList.remove('active'));

      handleNavPage(btn.dataset.page);
    });
  });


  document.getElementById('proxyList').addEventListener('click', handleProxyListClick);


  api.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PROXY_STATUS_UPDATED') {
      state.enabled = msg.data.enabled;
      state.ipInfo = msg.data.info;
      sendMessage('GET_PROXIES').then(proxies => {
        state.proxies = proxies || [];
        renderProxyList();
      });
      updateIpDisplay();
      updateToggleUI();
    }
    if (msg.type === 'SHOW_TOAST') {
      showToast(msg.data.message, msg.data.type);
    }

  });


  document.querySelectorAll('.custom-select').forEach(sel => {
    const trigger = sel.querySelector('.custom-select-trigger');
    const options = sel.querySelectorAll('.custom-select-option');
    const valueEl = sel.querySelector('.custom-select-value');
    const hidden = sel.nextElementSibling;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) sel.classList.add('open');
    });

    options.forEach(opt => {
      opt.addEventListener('click', () => {
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        valueEl.textContent = opt.textContent;
        hidden.value = opt.dataset.value;
        sel.classList.remove('open');
      });
    });
    const activeOpt = sel.querySelector('.custom-select-option.active');
    if (activeOpt && hidden) hidden.value = activeOpt.dataset.value;
  });


  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
  });
  document.getElementById('inputFormat').value = 'host:port:user:pass';

  initDatePicker();
  initTagSelect();
}

async function handleToggle() {
  const checked = document.getElementById('proxyToggle').checked;

  try {
    await sendMessage('TOGGLE_EXTENSION', { enabled: checked });
    state.enabled = checked;
    state.activeProxyId = null;

    const realIp = await sendMessage('GET_REAL_IP');
    state.ipInfo = realIp || null;

    updateToggleUI();
    updateIpDisplay();
    renderProxyList();
  } catch (e) {
    document.getElementById('proxyToggle').checked = !checked;
  }
}

function pollIp() {
  setTimeout(async () => {
    try {
      const info = await sendMessage('GET_CACHED_IP');
      if (info) { state.ipInfo = info; updateIpDisplay(); }
    } catch (_) { }
  }, 2500);
}

async function handleSubmitForm() {
  const proxiesRaw = document.getElementById('inputProxies').value.trim();
  const type = document.getElementById('inputType').value;
  const format = document.getElementById('inputFormat').value;
  const expiry = document.getElementById('inputExpiry').value.trim();
  const tag = document.getElementById('inputTag').value;
  const note = document.getElementById('inputNote').value.trim();

  if (!proxiesRaw) {
    document.getElementById('inputProxies').focus();
    showToast('Please enter at least one proxy', 'error');
    return;
  }

  const lines = proxiesRaw.split('\n').map(l => l.trim()).filter(Boolean);
  const parsedList = [];
  const invalidLines = [];

  lines.forEach((line, i) => {
    const p = parseProxyLine(line, format, type);
    if (p) parsedList.push(p);
    else invalidLines.push(i + 1);
  });

  if (invalidLines.length) {
    showToast(`Invalid format on line ${invalidLines.join(', ')}`, 'error');
    return;
  }

  const inputKeys = parsedList.map(p => `${p.host}:${p.port}`);
  const inputDups = inputKeys.filter((k, idx) => inputKeys.indexOf(k) !== idx);
  if (inputDups.length > 0) {
    const unique = [...new Set(inputDups)];
    showToast(`Duplicate proxies in input: ${unique.join(', ')}`, 'error');
    return;
  }

  const existingProxies = await sendMessage('GET_PROXIES') || [];
  const duplicates = parsedList.filter(p =>
    existingProxies.some(e => e.host === p.host && String(e.port) === String(p.port))
  );

  if (duplicates.length === parsedList.length) {
    // Tất cả đều trùng
    const names = duplicates.map(p => `${p.host}:${p.port}`);
    showToast(
      duplicates.length === 1
        ? `Proxy "${names[0]}" already exists.`
        : `All proxies already exist: ${names.join(', ')}`,
      'error'
    );
    return;
  }

  const toAdd = parsedList.filter(p =>
    !existingProxies.some(e => e.host === p.host && String(e.port) === String(p.port))
  );

  try {
    showToast('Checking proxy...', 'success');
    const beforeIds = new Set(existingProxies.map(x => x.id));

    for (const p of toAdd) {
      p.expires = expiry;
      p.tag = tag;
      p.note = note;
      await sendMessage('ADD_PROXY', p);
    }

    const afterAdd = await sendMessage('GET_PROXIES') || [];
    const newProxies = afterAdd.filter(x => !beforeIds.has(x.id));

    if (newProxies.length > 0) {
      const newProxy = newProxies[newProxies.length - 1]; // connect proxy mới nhất
      await sendMessage('CHECK_PROXY', { id: newProxy.id });
      state.activeProxyId = newProxy.id;
      state.recentIds = [newProxy.id, ...state.recentIds.filter(x => x !== newProxy.id)].slice(0, 10);
      chrome.storage.local.set({ recentProxyIds: state.recentIds });
      await sendMessage('SWITCH_PROXY', { proxyId: newProxy.id });
    }

    state.proxies = await sendMessage('GET_PROXIES') || [];

    if (duplicates.length > 0) {
      showToast(`Added ${toAdd.length}. Skipped ${duplicates.length} duplicate(s).`, 'warning');
    } else {
      showToast('Added & connected', 'success');
    }

    clearForm();
    showView('list');
  } catch (e) {
    showToast('Failed to save proxies', 'error');
  }
}

async function handleProxyListClick(e) {
  const tagBox = e.target.closest('.proxy-tag-box');
  if (tagBox) {
    tagBox.classList.toggle('active');
    return;
  }

  let t = e.target;
  while (t && t !== this && !t.dataset.action) t = t.parentElement;
  if (!t || !t.dataset.action) return;

  const { action, id } = t.dataset;

  if (action === 'switch') {
    state.activeProxyId = id;
    await sendMessage('SWITCH_PROXY', { proxyId: id });
    renderProxyList();
    pollIp();
  }
  if (action === 'reconnect') {
    if (!state.enabled) return;

    state.activeProxyId = id;
    state.recentIds = [id, ...state.recentIds.filter(x => x !== id)].slice(0, 10);
    chrome.storage.local.set({ recentProxyIds: state.recentIds });

    await sendMessage('SWITCH_PROXY', { proxyId: id });
    renderProxyList();
    pollIp();
  }
  if (action === 'delete') {
    e.stopPropagation();
    await sendMessage('DELETE_PROXY', { id });
    state.proxies = await sendMessage('GET_PROXIES') || [];
    if (state.proxies.length === 0) showView('empty');
    else renderProxyList();
  }
}

function handleNavPage(page) {
  if (page === 'settings') {
    api.runtime.openOptionsPage();
  }
  if (page === 'manager') {
    api.runtime.openOptionsPage();
  }
  if (page === 'rules') {
    api.runtime.openOptionsPage();
  }
}

function render() {
  updateToggleUI();
  updateIpDisplay();
  if (state.proxies.length === 0) showView('empty');
  else showView('list');
}

function showView(view) {
  state.currentView = view;
  document.getElementById('viewEmpty').classList.toggle('hidden', view !== 'empty');
  document.getElementById('viewList').classList.toggle('hidden', view !== 'list');
  document.getElementById('viewForm').classList.toggle('hidden', view !== 'form');

  document.getElementById('ipArea').classList.toggle('hidden', view === 'form');
  document.getElementById('formTitle').classList.toggle('hidden', view !== 'form');

  if (view === 'list') {
    document.querySelectorAll('.tab[data-tab]').forEach(t => {
      const isActive = t.dataset.tab === state.currentTab;
      t.classList.toggle('active', isActive);
      t.innerHTML = isActive
        ? `<span class="tab-arrow">▶</span>${t.dataset.label}`
        : t.dataset.label;
    });
    renderProxyList();
  }
}

function updateToggleUI() {
  document.getElementById('proxyToggle').checked = state.enabled;
  const content = document.querySelector('.popup-content');
  if (content) {
    content.style.opacity = state.enabled ? '1' : '0.4';
    content.style.pointerEvents = state.enabled ? 'auto' : 'none';
  }
}

function updateIpDisplay() {
  const addrEl = document.getElementById('ipAddress');
  const flagEl = document.getElementById('ipFlag');


  const isConnectingToProxy = state.enabled && state.activeProxyId && !state.ipInfo;

  if (!state.ipInfo) {
    if (isConnectingToProxy) {
      addrEl.textContent = 'Connecting...';
      addrEl.classList.add('dim');
      flagEl.innerHTML = `<svg class="spin-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
         </svg>`;
    } else {
      addrEl.textContent = '---';
      addrEl.classList.add('dim');
      flagEl.innerHTML = '🌐';
    }
    return;
  }

  const cc = (state.ipInfo.countryCode || '').toLowerCase();
  flagEl.innerHTML = cc
    ? `<img src="https://flagcdn.com/24x18/${cc}.png" width="24" height="18" style="border-radius:2px;">`
    : '🌐';
  addrEl.textContent = state.ipInfo.ip || '---';
  addrEl.classList.toggle('dim', !state.enabled);
}

function renderProxyList() {
  const list = document.getElementById('proxyList');
  const query = (document.getElementById('searchInput').value || '').toLowerCase();
  // const isPinned = state.currentTab === 'pinned';

  let proxies;

  if (state.currentTab === 'pinned') {
    proxies = state.proxies.filter(p => p.isPinned);

  } else if (state.currentTab === 'recent') {
    proxies = state.recentIds
      .map(id => state.proxies.find(p => p.id === id))
      .filter(Boolean)
      .slice(0, 10);

  } else {
    proxies = [...state.proxies].reverse().slice(0, 10);
  }

  if (query) {
    proxies = proxies.filter(p => {
      const haystack = [
        `${p.host}:${p.port}`,
        p.ip,
        p.location,
        p.status
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  if (proxies.length === 0) {
    list.innerHTML = '<div class="empty-state">No proxies found</div>';
    return;
  }

  list.innerHTML = proxies.map(p => {
    const isActive = p.id === state.activeProxyId;
    const tagHtml = renderTagBadges(p.tag);

    const addrLine = p.host && p.port ? `${p.host}:${p.port}` : (p.addr || '');
    const flagHtml = p.countryCode ? getFlag(p.countryCode) : '';
    // const subLine = p.ip || p.location ? `${flagHtml} ${[p.ip, p.location].filter(Boolean).join(' | ')}` : '';
    const city = p.location ? p.location.split(',')[0].trim() : '';
    const subLine = p.ip || city ? `${flagHtml} ${[p.ip, city].filter(Boolean).join(' | ')}` : '';

    const actionHtml = isActive && p.status === 'error'
      ? '<span class="proxy-item-status error-status">Error</span>'
      : isActive && p.status === 'active'
        ? '<span class="proxy-item-status active-status">Connecting</span>'
        : isActive
          ? '<span class="proxy-item-status connecting">Connecting</span>'
          : `<button class="btn-reconnect" data-action="reconnect" data-id="${p.id}" title="Connect">
              <img src="../../icons/ic-connect.png" width="26" height="26">
            </button>`;

    return `
    <div class="proxy-item ${isActive ? 'is-active' : ''}" data-id="${p.id}">
      <div class="proxy-item-info">
        <div class="proxy-item-addr">${escHtml(addrLine)}</div>
        <div class="proxy-item-sub">${subLine || ''}</div>
      </div>
      <div class="proxy-tag-box">${tagHtml}</div>
      <div class="proxy-item-action">${actionHtml}</div>
    </div>`;
  }).join('');
}

function clearForm() {
  ['inputProxies', 'inputExpiry', 'inputNote'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inputType').value = 'http';
  document.getElementById('inputFormat').value = 'host:port:user:pass';
  document.getElementById('inputTag').value = '';
}

function parseProxyLine(line, format, type) {
  line = line.trim();
  if (!line) return null;

  const isPort = v => /^\d{1,5}$/.test(v) && +v > 0 && +v <= 65535;
  const isHost = v => /^[\w.\-]+$/.test(v);


  const urlMatch = line.match(/^(https?|socks[45]?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/i);
  if (urlMatch) {
    return {
      type: urlMatch[1].toLowerCase(),
      host: urlMatch[4],
      port: +urlMatch[5],
      username: urlMatch[2] || '',
      password: urlMatch[3] || '',
      addr: `${urlMatch[4]}:${urlMatch[5]}`
    };
  }

  const p = line.split(':');

  if (format === 'host:port') {
    if (p.length !== 2 || !isHost(p[0]) || !isPort(p[1])) return null;
    return { type, host: p[0], port: +p[1], username: '', password: '', addr: `${p[0]}:${p[1]}` };
  }

  if (format === 'host:port:user:pass') {
    if (p.length < 4 || !isPort(p[1]) || !p[2] || !p[3]) return null;
    // bỏ !isHost(p[0]) — IP/hostname đã được server validate
    return { type, host: p[0], port: +p[1], username: p[2], password: p.slice(3).join(':'), addr: `${p[0]}:${p[1]}` };
  }

  if (format === 'host:port@user:pass') {
    if (!line.includes('@')) return null;
    const [before, after] = line.split('@');
    const b = before.split(':');
    const a = after.split(':');
    if (!isHost(b[0]) || !isPort(b[1]) || !a[0] || !a[1]) return null;
    return { type, host: b[0], port: +b[1], username: a[0], password: a[1], addr: `${b[0]}:${b[1]}` };
  }

  if (format === 'user:pass:host:port') {
    if (p.length < 4 || !isHost(p[2]) || !isPort(p[3]) || !p[0] || !p[1]) return null;
    return { type, host: p[2], port: +p[3], username: p[0], password: p[1], addr: `${p[2]}:${p[3]}` };
  }

  if (format === 'user:pass@host:port') {
    if (!line.includes('@')) return null;
    const [before, after] = line.split('@');
    const b = before.split(':');
    const a = after.split(':');
    if (!b[0] || !b[1] || !isHost(a[0]) || !isPort(a[1])) return null;
    return { type, host: a[0], port: +a[1], username: b[0], password: b[1], addr: `${a[0]}:${a[1]}` };
  }

  return null;
}

function getFlag(code) {
  if (!code || code.length !== 2) return '<span>🌐</span>';
  const cc = code.toLowerCase();
  return `<img class="flag-icon" src="https://cdn.jsdelivr.net/gh/HatScripts/circle-flags@2.6.0/flags/${cc}.svg" onerror="this.replaceWith('🌐')">`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type = 'success') {
  const t = document.getElementById('toast');
  if (t._timer) clearTimeout(t._timer);
  t.textContent = message;
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  void t.offsetWidth;
  t.classList.add('show');
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}
function initDatePicker() {
  const wrap = document.getElementById('datePickerWrap');
  const trigger = document.getElementById('dateTrigger');
  const dropdown = document.getElementById('dateDropdown');
  const grid = document.getElementById('dateGrid');
  const monthYear = document.getElementById('dateMonthYear');
  const triggerValue = document.getElementById('dateTriggerValue');
  const hidden = document.getElementById('inputExpiry');

  const now = new Date();
  let current = { year: now.getFullYear(), month: now.getMonth() };
  let selectedDate = null;
  let tempSelected = null;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function renderCalendar() {
    const { year, month } = current;
    monthYear.textContent = `${MONTHS[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    let cells = '';


    for (let i = firstDay - 1; i >= 0; i--) {
      cells += `<div class="date-cell other-month">${daysInPrev - i}</div>`;
    }


    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
      const isSel = tempSelected && tempSelected.d === d && tempSelected.m === month && tempSelected.y === year;
      let cls = 'date-cell';
      if (isToday) cls += ' today';
      if (isSel) cls += ' selected';
      cells += `<div class="${cls}" data-d="${d}" data-m="${month}" data-y="${year}">${d}</div>`;
    }


    const total = firstDay + daysInMonth;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= remaining; i++) {
      cells += `<div class="date-cell other-month">${i}</div>`;
    }

    grid.innerHTML = cells;

    grid.querySelectorAll('.date-cell[data-d]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        tempSelected = { d: +cell.dataset.d, m: +cell.dataset.m, y: +cell.dataset.y };
        renderCalendar();
      });
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
      wrap.classList.add('open');
      renderCalendar();
    }
  });

  document.getElementById('datePrev').addEventListener('click', () => {
    current.month--;
    if (current.month < 0) { current.month = 11; current.year--; }
    renderCalendar();
  });

  document.getElementById('dateNext').addEventListener('click', () => {
    current.month++;
    if (current.month > 11) { current.month = 0; current.year++; }
    renderCalendar();
  });

  document.getElementById('dateClear').addEventListener('click', () => {
    tempSelected = null;
    selectedDate = null;
    triggerValue.textContent = 'mm/dd/yy';
    triggerValue.style.color = '';
    hidden.value = '';
    closeAllDropdowns();
  });

  document.getElementById('dateApply').addEventListener('click', () => {
    if (tempSelected) {
      selectedDate = { ...tempSelected };
      const { d, m, y } = selectedDate;
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      triggerValue.textContent = `${mm}/${dd}/${y}`;
      triggerValue.style.color = 'var(--text)';
      hidden.value = `${y}-${mm}-${dd}`;
    }
    wrap.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && !dropdown.contains(e.target)) {
      wrap.classList.remove('open');
    }
  });
}

function initTagSelect() {
  const wrap = document.getElementById('tagSelectWrap');
  const trigger = document.getElementById('tagSelectTrigger');
  const dropdown = document.getElementById('tagSelectDropdown');
  const list = document.getElementById('tagOptionList');
  const valueEl = document.getElementById('tagSelectValue');
  const hidden = document.getElementById('inputTag');

  let tempSelected = [];
  let selectedTags = [];

  function getAllTags() {
    const all = [];
    state.proxies.forEach(p => {
      if (!p.tag) return;
      try {
        JSON.parse(p.tag).forEach(t => {
          if (!all.find(x => x.name === t.name)) all.push(t);
        });
      } catch { }
    });
    return all;
  }

  function renderList() {
    const allTags = getAllTags();
    if (allTags.length === 0) {
      list.innerHTML = '<div class="tag-empty">No tags available</div>';
      return;
    }
    list.innerHTML = allTags.map(t => {
      const isChecked = tempSelected.find(x => x.name === t.name);
      return `
        <div class="tag-option-item ${isChecked ? 'checked' : ''}" data-name="${t.name}" data-color="${t.color}">
          <div class="tag-color-dot" style="background:${t.color}"></div>
          <span class="tag-option-name">${t.name}</span>
          <div class="tag-option-checkbox">
            ${isChecked ? `<svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3 5-6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>` : ''}
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.tag-option-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = item.dataset.name;
        const color = item.dataset.color;
        const idx = tempSelected.findIndex(x => x.name === name);
        if (idx >= 0) tempSelected.splice(idx, 1);
        else tempSelected.push({ name, color });
        renderList();
      });
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
      wrap.classList.add('open');
      tempSelected = [...selectedTags];
      renderList();
    }
  });

  document.getElementById('tagClear').addEventListener('click', (e) => {
    e.stopPropagation();
    tempSelected = [];
    selectedTags = [];
    hidden.value = '';
    valueEl.textContent = '-- none --';
    valueEl.classList.remove('has-value');
    wrap.classList.remove('open');
  });

  document.getElementById('tagApply').addEventListener('click', (e) => {
    e.stopPropagation();
    selectedTags = [...tempSelected];
    if (selectedTags.length > 0) {
      hidden.value = JSON.stringify(selectedTags);
      valueEl.innerHTML = selectedTags.map(t =>
        `<span class="tag-badge-trigger" style="
        display:inline-flex;align-items:center;
        padding:2px 8px;border-radius:999px;
        font-size:11px;font-weight:600;
        background:${t.color};
        border:none;
        color:rgba(65,70,81,1);
        white-space:nowrap;">${escHtml(t.name)}</span>`
      ).join('');
      valueEl.classList.add('has-value');
    } else {
      hidden.value = '';
      valueEl.innerHTML = '-- none --';
      valueEl.classList.remove('has-value');
    }
    wrap.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
}

function closeAllDropdowns() {
  document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
  document.getElementById('datePickerWrap')?.classList.remove('open');
  document.getElementById('tagSelectWrap')?.classList.remove('open');
}
function renderTagBadges(tagData) {
  if (!tagData) return '';
  try {
    const tags = JSON.parse(tagData);
    if (!Array.isArray(tags) || tags.length === 0) return '';
    return tags.map(t => `
      <span style="
        display:inline-flex;align-items:center;
        padding:2px 8px;border-radius:999px;
        font-size:11px;font-weight:600;
        background:${t.color};
        border:none;
        color:rgba(65,70,81,1);
        white-space:nowrap;">${escHtml(t.name)}</span>
    `).join('');
  } catch {
    return '';
  }
}