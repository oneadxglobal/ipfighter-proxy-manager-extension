
const FirefoxProxyHandler = {
  _activeProxy: null,
  _testProxy: null,
  _isEnabled: false,
  _rules: [],
  _proxies: [],
  _compiledBypass: [],
  _defaultProxy: null,

  init() {
    browser.proxy.onRequest.addListener(
      FirefoxProxyHandler._handleRequest,
      { urls: ['<all_urls>'] }
    );
    browser.proxy.onError.addListener((error) => {
    });
  },

  async connect(proxy) {
    FirefoxProxyHandler._activeProxy = proxy;
    FirefoxProxyHandler._isEnabled = true;
    await FirefoxProxyHandler.refreshPacScript();
  },

  async disconnect() {
    FirefoxProxyHandler._activeProxy = null;
    FirefoxProxyHandler._isEnabled = false;
    await FirefoxProxyHandler.refreshPacScript();
  },

  async setupTestProxy(proxy) {
    FirefoxProxyHandler._testProxy = proxy;
  },

  async restoreTestProxy(wasEnabled, activeProxy) {
    FirefoxProxyHandler._testProxy = null;
    if (wasEnabled && activeProxy) {
      await FirefoxProxyHandler.connect(activeProxy);
    } else {
      await FirefoxProxyHandler.disconnect();
    }
  },

  async refreshPacScript() {
    if (typeof Storage === 'undefined' || typeof RuleEngine === 'undefined') return;
    FirefoxProxyHandler._rules = await Storage.getRules();
    FirefoxProxyHandler._proxies = await Storage.getProxies();
    const settings = await Storage.getSettings();
    const bypassList = settings.bypassMode === 'default' ? [] : (settings.bypassList || []);
    FirefoxProxyHandler._compiledBypass = RuleEngine.compileBypassList(bypassList);
    FirefoxProxyHandler._defaultProxy = FirefoxProxyHandler._activeProxy;
  },

  _handleRequest(requestInfo) {
    if (FirefoxProxyHandler._testProxy) {
      return FirefoxProxyHandler._formatProxyInfo(FirefoxProxyHandler._testProxy);
    }

    if (!FirefoxProxyHandler._isEnabled || !FirefoxProxyHandler._activeProxy) {
      return { type: 'direct' };
    }

    if (typeof RuleEngine !== 'undefined') {
      const result = RuleEngine.evaluateSync(
        requestInfo,
        FirefoxProxyHandler._rules,
        FirefoxProxyHandler._proxies,
        FirefoxProxyHandler._defaultProxy,
        FirefoxProxyHandler._compiledBypass
      );

      if (result.matched) {
        if (result.action === 'direct') return { type: 'direct' };
        if (result.action === 'block') return { type: 'http', host: '0.0.0.0', port: 1 };
        if (result.proxyId) {
          const proxy = FirefoxProxyHandler._proxies.find(p => p.id === result.proxyId);
          if (proxy) return FirefoxProxyHandler._formatProxyInfo(proxy);
        }
      }
    }

    if (FirefoxProxyHandler._defaultProxy) {
      return FirefoxProxyHandler._formatProxyInfo(FirefoxProxyHandler._defaultProxy);
    }

    return { type: 'direct' };
  },

  _formatProxyInfo(proxy) {
    const proxyInfo = {
      type: FirefoxProxyHandler._getProxyType(proxy.type),
      host: proxy.host,
      port: proxy.port
    };

    if (proxy.username) {
      proxyInfo.username = proxy.username;
      proxyInfo.password = proxy.password;
    }

    if (proxy.type === 'socks5' || proxy.type === 'socks') {
      proxyInfo.proxyDNS = true;
    }

    return proxyInfo;
  },

  _getProxyType(type) {
    switch (type) {
      case 'socks5': case 'socks': return 'socks';
      case 'socks4': return 'socks4';
      case 'https': return 'https';
      default: return 'http';
    }
  }
};

// Tự đăng ký vào ProxyConnector
ProxyConnector.register(FirefoxProxyHandler);

if (typeof globalThis !== 'undefined') {
  globalThis.FirefoxProxyHandler = FirefoxProxyHandler;
}