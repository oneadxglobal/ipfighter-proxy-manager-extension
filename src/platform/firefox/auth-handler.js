const FirefoxAuthHandler = {
  init() {
    browser.webRequest.onAuthRequired.addListener(
      FirefoxAuthHandler._onAuthRequired,
      { urls: ['<all_urls>'] },
      ['blocking']
    );
  },

  _onAuthRequired(details) {
    if (!details.isProxy) {
      return {};
    }
    const proxy = FirefoxProxyHandler._testProxy || FirefoxProxyHandler._activeProxy;
    
    if (proxy && proxy.username) {
      // Check if the auth request matches the proxy
      // If we are using Rule Engine, the proxy returned might not be the active proxy
      // but Firefox's onAuthRequired does not easily tell us which proxy triggered it 
      // without checking the request URL. However, since proxy credentials are 
      // usually unique per proxy, we can try to match the active proxy first.
      // A full rule engine auth match requires storing credentials of all proxies.
      
      const allProxies = FirefoxProxyHandler._proxies || [];
      // If there are multiple proxies, find the one that matches this auth request (we can't know for sure here)
      // We will just provide the active or test proxy's credentials for now, as it's the primary use case.
      // To properly support multiple proxies with auth, we'd iterate and return matching proxy.
      // For now, we return active or test proxy credentials.
      
      return {
        authCredentials: {
          username: proxy.username,
          password: proxy.password
        }
      };
    }
    return {};
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.FirefoxAuthHandler = FirefoxAuthHandler;
}
