const ProxyManager = {
  _checkLock: 0,
  async getAll() {
    return await Storage.getProxies();
  },

  async getById(id) {
    const proxies = await Storage.getProxies();
    return proxies.find(p => p.id === id) || null;
  },

  async add(proxyData) {
    const proxies = await Storage.getProxies();
    const proxy = {
      id: Utils.generateId(),
      name: proxyData.name || `${(proxyData.type || 'http').toUpperCase()} ${proxyData.host}:${proxyData.port}`,
      type: proxyData.type || PROXY_TYPES.HTTP,
      inputFormat: proxyData.inputFormat || 'host:port:user:pass',
      host: proxyData.host,
      port: parseInt(proxyData.port),
      username: proxyData.username || '',
      password: proxyData.password || '',
      color: proxyData.color || Utils.generateProxyColor(),
      tag: proxyData.tag || '',
      note: proxyData.note || '',
      expires: proxyData.expires || '',
      isPinned: proxyData.isPinned || false,
      status: 'idle',
      ip: '',
      location: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    proxies.push(proxy);
    await Storage.setProxies(proxies);
    return proxy;
  },

  async update(id, data) {
    const proxies = await Storage.getProxies();
    const index = proxies.findIndex(p => p.id === id);
    if (index === -1) return null;
    proxies[index] = { ...proxies[index], ...data, id, updatedAt: Date.now() };
    await Storage.setProxies(proxies);
    return proxies[index];
  },

  async remove(id) {
    let proxies = await Storage.getProxies();
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) return false;
    proxies = proxies.filter(p => p.id !== id);
    await Storage.setProxies(proxies);
    const activeId = await Storage.getActiveProxyId();
    if (activeId === id) {
      await Storage.setActiveProxyId(null);
      await Storage.setProxyEnabled(false);
    }
    return true;
  },

  async getActive() {
    const activeId = await Storage.getActiveProxyId();
    if (!activeId) return null;
    return await ProxyManager.getById(activeId);
  },

  async setActive(id) {
    const proxy = await ProxyManager.getById(id);
    if (!proxy) return false;
    await Storage.setActiveProxyId(id);
    return true;
  },

  async checkProxy(id) {
    const proxy = await ProxyManager.getById(id);
    if (!proxy) return null;
    while (ProxyManager._checkLock && (Date.now() - ProxyManager._checkLock < 15000)) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    ProxyManager._checkLock = Date.now();
    
    const wasEnabled = await Storage.isProxyEnabled();
    const activeId = await Storage.getActiveProxyId();
    const activeProxy = activeId ? await ProxyManager.getById(activeId) : null;

    try {
      await ProxyManager.update(id, { status: 'checking' });

      if (ProxyConnector.handler && typeof ProxyConnector.handler.setupTestProxy === 'function') {
        await ProxyConnector.handler.setupTestProxy(proxy);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 5000);

      let data;
      try {
        const response = await fetch(IP_CHECK_API, {
          cache: 'no-cache',
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        data = await response.json();
      } catch (fetchErr) {
        clearTimeout(timeout);
        throw fetchErr;
      }

      const result = {
        status: 'active',
        ip: data.ip || '',
        location: [data.city, data.country].filter(Boolean).join(', '),
        countryCode: data.country || ''
      };
      await ProxyManager.update(id, result);
      return result;

    } catch (error) {
      await ProxyManager.update(id, { status: 'error', ip: '', location: '', countryCode: '' });
      return { status: 'error', ip: '', location: '', countryCode: '' };
    } finally {
      if (ProxyConnector.handler && typeof ProxyConnector.handler.restoreTestProxy === 'function') {
        await ProxyConnector.handler.restoreTestProxy(wasEnabled, activeProxy);
      }


      ProxyManager._checkLock = 0;
    }
  },

  async togglePin(id) {
    const proxy = await ProxyManager.getById(id);
    if (!proxy) return false;
    await ProxyManager.update(id, { isPinned: !proxy.isPinned });
    return true;
  },

  async importFromText(text, defaultType = PROXY_TYPES.HTTP) {
    const lines = text.split('\n').filter(l => l.trim());
    const imported = [];
    for (const line of lines) {
      const parsed = Utils.parseProxyString(line);
      if (parsed) {
        if (!parsed.type || parsed.type === 'http') parsed.type = defaultType;
        const proxy = await ProxyManager.add(parsed);
        imported.push(proxy);
      }
    }
    return imported;
  },

  async exportToText(format = 'standard') {
    const proxies = await Storage.getProxies();
    return proxies.map(p => {
      if (format === 'url') {
        const auth = p.username ? `${p.username}:${p.password}@` : '';
        return `${p.type}://${auth}${p.host}:${p.port}`;
      }
      const parts = [p.host, p.port];
      if (p.username) parts.push(p.username, p.password);
      return parts.join(':');
    }).join('\n');
  },

  async exportToJson() {
    const proxies = await Storage.getProxies();
    return JSON.stringify(proxies, null, 2);
  },

  async importFromJson(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      const proxies = await Storage.getProxies();
      for (const item of data) {
        const proxy = {
          id: Utils.generateId(),
          name: item.name || `Proxy ${proxies.length + 1}`,
          type: item.type || PROXY_TYPES.HTTP,
          inputFormat: item.inputFormat || 'host:port:user:pass',
          host: item.host,
          port: parseInt(item.port),
          username: item.username || '',
          password: item.password || '',
          color: item.color || Utils.generateProxyColor(),
          tag: item.tag || '',
          note: item.note || '',
          expires: item.expires || '',
          isPinned: item.isPinned || false,
          status: 'idle',
          ip: item.ip || '',
          location: item.location || '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        proxies.push(proxy);
      }
      await Storage.setProxies(proxies);
      return data.length;
    } catch (err) {
      return 0;
    }
  }
};

Utils.generateProxyColor = function () {
  const colors = [
    '#6C5CE7', '#00CEC9', '#FD79A8', '#FDCB6E',
    '#E17055', '#00B894', '#0984E3', '#D63031',
    '#A29BFE', '#55EFC4', '#FF7675', '#74B9FF'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

if (typeof globalThis !== 'undefined') {
  globalThis.ProxyManager = ProxyManager;
}