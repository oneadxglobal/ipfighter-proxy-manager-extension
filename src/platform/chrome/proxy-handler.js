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

    const rules = await Storage.getRules();
    const enabledRules = rules.filter(r => r.enabled);
    const settings = await Storage.getSettings();
    const bypassList = settings.bypassList || [];
    const effectiveBypassList = settings.bypassMode === 'default' ? [] : bypassList;


    if (enabledRules.length > 0 || effectiveBypassList.length > 0) {
      const pacScript = await RuleEngine.generatePacScript(proxy);
      return new Promise((resolve, reject) => {
        chrome.proxy.settings.set({
          value: { mode: 'pac_script', pacScript: { data: pacScript } },
          scope: 'regular'
        }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else { resolve(); }
        });
      });
    }

    const scheme = proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5'
      : proxy.type === 'socks4' ? 'socks4'
        : proxy.type === 'https' ? 'https' : 'http';

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: { scheme, host: proxy.host, port: proxy.port },
            bypassList: ['localhost', '127.0.0.1', '::1', '<local>']
          }
        },
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
    const scheme = proxy.type === 'socks5' || proxy.type === 'socks' ? 'socks5'
      : proxy.type === 'socks4' ? 'socks4'
        : proxy.type === 'https' ? 'https' : 'http';

    return new Promise((resolve, reject) => {
      chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: { singleProxy: { scheme, host: proxy.host, port: proxy.port } }
        },
        scope: 'regular'
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
        ChromeAuthHandler.setCredentials(proxy.username || '', proxy.password || '');
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