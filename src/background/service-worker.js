/**
 * Background Service Worker - Chrome MV3
 */

importScripts(
  '../shared/constants.js',
  '../shared/utils.js',
  '../shared/storage.js',
  '../core/proxy-manager.js',
  '../core/rule-engine.js',
  '../core/ip-checker.js',
  '../core/privacy-protector.js',
  '../core/badge-manager.js',
  '../core/proxy-connector.js',
  '../platform/proxy-handler.js',
  '../platform/auth-handler.js'
);

// Khởi tạo auth handler
ChromeAuthHandler.init();

// Khôi phục trạng thái
(async () => {
  try {
    const isExtEnabled = await Storage.isExtensionEnabled();
    if (!isExtEnabled) {
      await BadgeManager.reset();
      return;
    }
    const isEnabled = await Storage.isProxyEnabled();
    if (isEnabled) {
      const proxy = await ProxyManager.getActive();
      if (proxy) {
        await ProxyConnector.handler.connect(proxy);
        const ipInfo = await IpChecker.getCachedInfo();
        await BadgeManager.updateStatus(true, ipInfo);
        await PrivacyProtector.applyAll(ipInfo);
      } else {
        await BadgeManager.updateStatus(true, null);
      }
    } else {
      await BadgeManager.updateStatus(true, null); // 
    }
  } catch (error) {
  }
})();

// Message handler
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message) {
  const { type, data } = message;
  switch (type) {
    case 'GET_STATUS': return await ProxyConnector.getStatus();
    case 'TOGGLE_PROXY': return await ProxyConnector.toggle();
    case 'CONNECT_PROXY':
      const proxy = await ProxyManager.getById(data.proxyId);
      if (proxy) return await ProxyConnector.connect(proxy);
      return { error: 'Proxy not found' };
    case 'DISCONNECT_PROXY': return await ProxyConnector.disconnect();
    case 'SWITCH_PROXY': return await ProxyConnector.switchProxy(data.proxyId);
    case 'GET_PROXIES': return await ProxyManager.getAll();
    case 'ADD_PROXY': return await ProxyManager.add(data);
    case 'UPDATE_PROXY': return await ProxyManager.update(data.id, data);
    case 'REMOVE_PROXY': return await ProxyManager.remove(data.id);
    case 'TOGGLE_PIN': {
      const proxy = await ProxyManager.getById(data.id);
      if (!proxy) return { error: 'Proxy not found' };
      return await ProxyManager.update(data.id, { ...proxy, isPinned: !proxy.isPinned });
    }
    case 'CHECK_PROXY': {
      const result = await ProxyManager.checkProxy(data.id);
      // browserAPI.runtime.sendMessage({
      //   type: 'PROXY_CHECKING',
      //   data: {}
      // }).catch(() => { });
      return result;
    }
    case 'IMPORT_PROXIES_TEXT': return await ProxyManager.importFromText(data.text, data.type);
    case 'IMPORT_PROXIES_JSON': return await ProxyManager.importFromJson(data.json);
    case 'EXPORT_PROXIES_TEXT': return await ProxyManager.exportToText(data.format);
    case 'EXPORT_PROXIES_JSON': return await ProxyManager.exportToJson();
    case 'CHECK_IP': return await IpChecker.checkIp();
    case 'GET_CACHED_IP': return await IpChecker.getCachedInfo();
    case 'TOGGLE_EXTENSION': {
      const { enabled } = data;
      await Storage.setExtensionEnabled(enabled);
      if (!enabled) {
        await ProxyConnector.disconnect();
        await IpChecker.clearCache();
        await BadgeManager.reset();
      } else {
        await BadgeManager.updateStatus(true, null);
      }
      return { success: true };
    }
    case 'GET_REAL_IP': {
      await IpChecker.clearCache();
      return await IpChecker.checkIp();
    }
    case 'GET_RULES': return await Storage.getRules();
    case 'ADD_RULE': {
      const result = await RuleEngine.addRule(data);
      await ChromeProxyHandler.refreshPacScript();
      return result;
    }
    case 'UPDATE_RULE': {
      const result = await RuleEngine.updateRule(data.id, data);
      await ChromeProxyHandler.refreshPacScript();
      return result;
    }
    case 'REMOVE_RULE': {
      const result = await RuleEngine.removeRule(data.id);
      await ChromeProxyHandler.refreshPacScript();
      return result;
    }
    case 'GET_PRESET_RULES': return RuleEngine.getPresetRules();
    case 'GET_SETTINGS': return await Storage.getSettings();
    case 'REFRESH_PAC':
      await ChromeProxyHandler.refreshPacScript();
      return { success: true };
    case 'UPDATE_SETTINGS':
      await Storage.setSettings(data);
      const isEnabled = await Storage.isProxyEnabled();
      if (isEnabled) {
        await ChromeProxyHandler.refreshPacScript();
      }
      const ipInfo = await IpChecker.getCachedInfo();
      await PrivacyProtector.applyAll(ipInfo);
      return { success: true };
    case 'GET_SPOOF_DATA':
      const result = await Storage.get('ipf_spoof_data');
      return result.ipf_spoof_data || {};
    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// Alarm auto check IP
browserAPI.alarms.create('ipcheck', { periodInMinutes: 5 });
browserAPI.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ipcheck') {
    const isEnabled = await Storage.isProxyEnabled();
    const settings = await Storage.getSettings();
    if (isEnabled && settings.autoCheckIp) {
      const ipInfo = await IpChecker.checkIp();
      await BadgeManager.updateStatus(true, ipInfo);
    }
  }
});

// Spoof data injection
let currentSpoofData = null;
browserAPI.storage.local.get('ipf_spoof_data', (result) => {
  currentSpoofData = result.ipf_spoof_data || null;
});
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.ipf_spoof_data) {
    currentSpoofData = changes.ipf_spoof_data.newValue || null;
  }
});

if (chrome.webNavigation && chrome.scripting) {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (!details.url.startsWith('chrome://') && !details.url.startsWith('edge://')) {
      if (currentSpoofData && Object.keys(currentSpoofData).length > 0) {
        chrome.scripting.executeScript({
          target: { tabId: details.tabId, frameIds: [details.frameId] },
          world: 'MAIN',
          injectImmediately: true,
          func: (spoofData) => {
            'use strict';
            if (spoofData.timezone) {
              const orig = Intl.DateTimeFormat.prototype.resolvedOptions;
              Intl.DateTimeFormat.prototype.resolvedOptions = function () {
                const o = orig.call(this); o.timeZone = spoofData.timezone; return o;
              };
              const getTzOffset = (tz) => {
                try {
                  const now = new Date();
                  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
                  const tzd = new Date(now.toLocaleString('en-US', { timeZone: tz }));
                  return (utc - tzd) / 60000;
                } catch { return null; }
              };
              const off = getTzOffset(spoofData.timezone);
              if (off !== null) Date.prototype.getTimezoneOffset = function () { return off; };
            }
            if (spoofData.languages) {
              const langs = spoofData.languages.split(',').map(l => l.trim()).filter(Boolean);
              if (langs.length > 0) {
                const full = [];
                for (const l of langs) { full.push(l); if (l.length === 2) full.push(l + '-' + l.toUpperCase()); }
                if (!full.includes('en')) full.push('en', 'en-US');
                Object.defineProperty(navigator, 'language', { get: () => full[0], configurable: true });
                Object.defineProperty(navigator, 'languages', { get: () => Object.freeze([...full]), configurable: true });
              }
            }
            if (spoofData.latitude !== undefined && spoofData.longitude !== undefined) {
              const fakePos = {
                coords: {
                  latitude: spoofData.latitude, longitude: spoofData.longitude,
                  accuracy: spoofData.accuracy || 100, altitude: null,
                  altitudeAccuracy: null, heading: null, speed: null
                },
                timestamp: Date.now()
              };
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition = (s) => { if (s) s(fakePos); };
                navigator.geolocation.watchPosition = (s) => { if (s) s(fakePos); return Math.floor(Math.random() * 10000); };
              }
            }
          },
          args: [currentSpoofData]
        }).catch(err => console.log('Spoofing inject error:', err.message));
      }
    }
  });
}

