const BadgeManager = {
  async updateStatus(isEnabled, proxyInfo) {
    const iconPrefix = isEnabled ? 'on' : 'off';

    const iconPaths = {
      "16": `/icons/icon-${iconPrefix}-16.png`,
      "32": `/icons/icon-${iconPrefix}-32.png`
    };


    const actionAPI = (typeof browserAPI !== 'undefined' && browserAPI.action)
      ? browserAPI.action
      : (typeof browserAPI !== 'undefined' && browserAPI.browserAction)
        ? browserAPI.browserAction
        : chrome.action || chrome.browserAction;

    if (!actionAPI) return;

    // và bắt được lỗi thực sự qua chrome.runtime.lastError
    await new Promise((resolve) => {
      actionAPI.setIcon({ path: iconPaths }, () => {
        const lastErr = chrome.runtime?.lastError || (typeof browser !== 'undefined' ? browser.runtime?.lastError : null);
        if (lastErr) {
          console.error(`[BadgeManager] setIcon FAILED:`, lastErr.message);
        } else {
          console.log(`[BadgeManager] setIcon SUCCESS: ${iconPrefix}`);
        }
        resolve();
      });
    });

    const badgeText = isEnabled && proxyInfo && proxyInfo.country
      ? proxyInfo.country
      : '';
    const badgeColor = isEnabled ? '#00B894' : '#636E72';

    await new Promise((resolve) => {
      actionAPI.setBadgeText({ text: badgeText }, () => {
        const lastErr = chrome.runtime?.lastError || (typeof browser !== 'undefined' ? browser.runtime?.lastError : null);
        if (lastErr) {
          console.error(`[BadgeManager] setBadgeText FAILED:`, lastErr.message);
        }
        resolve();
      });
    });

    await new Promise((resolve) => {
      actionAPI.setBadgeBackgroundColor({ color: badgeColor }, () => {
        const lastErr = chrome.runtime?.lastError || (typeof browser !== 'undefined' ? browser.runtime?.lastError : null);
        if (lastErr) {
          console.error(`[BadgeManager] setBadgeBackgroundColor FAILED:`, lastErr.message);
        }
        resolve();
      });
    });

    const tooltip = isEnabled && proxyInfo
      ? `IPFighter: ${proxyInfo.ip} (${proxyInfo.country} - ${proxyInfo.city})`
      : 'IPFighter: Proxy OFF';

    await new Promise((resolve) => {
      actionAPI.setTitle({ title: tooltip }, () => {
        const lastErr = chrome.runtime?.lastError || (typeof browser !== 'undefined' ? browser.runtime?.lastError : null);
        if (lastErr) {
          console.error(`[BadgeManager] setTitle FAILED:`, lastErr.message);
        }
        resolve();
      });
    });

  },

  async reset() {
    await BadgeManager.updateStatus(false, null);
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.BadgeManager = BadgeManager;
}