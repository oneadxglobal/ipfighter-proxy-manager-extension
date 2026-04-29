
const Storage = {
  async get(keys) {
    return new Promise((resolve) => {
      browserAPI.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  },

  async set(data) {
    return new Promise((resolve) => {
      browserAPI.storage.local.set(data, () => {
        resolve();
      });
    });
  },

  async remove(keys) {
    return new Promise((resolve) => {
      browserAPI.storage.local.remove(keys, () => {
        resolve();
      });
    });
  },

  async getProxies() {
    const result = await Storage.get(STORAGE_KEYS.PROXIES);
    return result[STORAGE_KEYS.PROXIES] || [];
  },

  async setProxies(proxies) {
    await Storage.set({ [STORAGE_KEYS.PROXIES]: proxies });
  },

  async getActiveProxyId() {
    const result = await Storage.get(STORAGE_KEYS.ACTIVE_PROXY_ID);
    return result[STORAGE_KEYS.ACTIVE_PROXY_ID] || null;
  },

  async setActiveProxyId(id) {
    await Storage.set({ [STORAGE_KEYS.ACTIVE_PROXY_ID]: id });
  },

  async isProxyEnabled() {
    const result = await Storage.get(STORAGE_KEYS.PROXY_ENABLED);
    return result[STORAGE_KEYS.PROXY_ENABLED] || false;
  },

  async setProxyEnabled(enabled) {
    await Storage.set({ [STORAGE_KEYS.PROXY_ENABLED]: enabled });
  },

  async getRules() {
    const result = await Storage.get(STORAGE_KEYS.RULES);
    return result[STORAGE_KEYS.RULES] || [];
  },

  async setRules(rules) {
    await Storage.set({ [STORAGE_KEYS.RULES]: rules });
  },

  async getSettings() {
    const result = await Storage.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
  },

  async setSettings(settings) {
    await Storage.set({ [STORAGE_KEYS.SETTINGS]: settings });
  },

  async getProxyInfo() {
    const result = await Storage.get(STORAGE_KEYS.PROXY_INFO);
    return result[STORAGE_KEYS.PROXY_INFO] || null;
  },

  async setProxyInfo(info) {
    await Storage.set({ [STORAGE_KEYS.PROXY_INFO]: info });
  }
  ,
  async isExtensionEnabled() {
    const result = await Storage.get('extensionEnabled');
    return result['extensionEnabled'] !== false;
  },

  async setExtensionEnabled(enabled) {
    await Storage.set({ extensionEnabled: enabled });
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.Storage = Storage;
}
