/**
 * Chrome Auth Handler - Xử lý proxy authentication (MV3)
 * Dùng permission webRequestAuthProvider
 */

const ChromeAuthHandler = {
  _credentials: { username: '', password: '' },

  async init() {
    // ✅ FIX: Đọc credentials từ storage (survive SW restart)
    const result = await new Promise(r =>
      chrome.storage.local.get('ipf_active_credentials', r)
    );
    if (result.ipf_active_credentials) {
      ChromeAuthHandler._credentials = result.ipf_active_credentials;
    }

    chrome.webRequest.onAuthRequired.addListener(
      (details, callback) => {
        const { username, password } = ChromeAuthHandler._credentials;
        if (username) {
          callback({ authCredentials: { username, password } });
        } else {
          callback({});
        }
      },
      { urls: ['<all_urls>'] },
      ['asyncBlocking']
    );
  },

  setCredentials(username, password) {
    ChromeAuthHandler._credentials = { username, password };
    // Cũng lưu vào storage
    if (username) {
      chrome.storage.local.set({ ipf_active_credentials: { username, password } });
    }
  },

  clearCredentials() {
    ChromeAuthHandler._credentials = { username: '', password: '' };
    chrome.storage.local.remove('ipf_active_credentials');
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.ChromeAuthHandler = ChromeAuthHandler;
}