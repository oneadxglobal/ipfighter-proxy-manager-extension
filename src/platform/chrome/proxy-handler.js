/**
 * Chrome Proxy Handler - chrome.proxy API (MV3)
 */

const ChromeProxyHandler = {
  _activeProxy: null,

  async connect(proxy) {
    ChromeProxyHandler._activeProxy = proxy;
    if (proxy.username) {
      ChromeAuthHandler.setCredentials(proxy.username, proxy.password);
    } else {
      ChromeAuthHandler.clearCredentials();
    }

    const pacScript = await RuleEngine.generatePacScript(proxy, Date.now());
    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: pacScript } },
        scope: 'regular'
      }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else { resolve(); }
      });
    });
  },

  async disconnect() {
    ChromeProxyHandler._activeProxy = null;
    await new Promise(r => chrome.storage.local.remove('ipf_active_credentials', r));
    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: { mode: 'direct' },
        scope: 'regular'
      }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else { resolve(); }
      });
    });
  },
  async refreshPacScript() {
    if (!ChromeProxyHandler._activeProxy) {
      return;
    }
    await ChromeProxyHandler.connect(ChromeProxyHandler._activeProxy);
  },

  async setupTestProxy(proxy) {
    // Luôn dùng PAC Script với Session ID duy nhất để ép Chrome làm mới kết nối cho việc check proxy
    const pacScript = `
      function FindProxyForURL(url, host) {
        // Session: ${Date.now()}
        if (!host || host === "localhost" || host === "127.0.0.1" || isPlainHostName(host)) return "DIRECT";
        return "${RuleEngine._proxyToPacString(proxy)}";
      }
    `;

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: pacScript } },
        scope: 'regular'
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          ChromeAuthHandler.setCredentials(proxy.username || '', proxy.password || '');
          resolve();
        }
      });
    });
  },

  async restoreTestProxy(wasEnabled, activeProxy) {
    if (wasEnabled && activeProxy) {
      ChromeAuthHandler.setCredentials(activeProxy.username || '', activeProxy.password || '');
      await ChromeProxyHandler.connect(activeProxy);
    } else {
      ChromeAuthHandler.clearCredentials();
      await new Promise((resolve) => {
        chrome.proxy.settings.set(
          { value: { mode: 'direct' }, scope: 'regular' },
          () => {
            resolve();
          }
        );
      });
    }
  }
};

ProxyConnector.register(ChromeProxyHandler);

if (typeof globalThis !== 'undefined') {
  globalThis.ChromeProxyHandler = ChromeProxyHandler;
}