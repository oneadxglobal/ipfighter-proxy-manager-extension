/**
 * Background Script - Firefox MV2
 * Các module đã được load qua background.html theo thứ tự
 * proxy-handler.js đã tự đăng ký vào ProxyConnector khi load
 */

// console.log('IPFighter Proxy Manager starting (Firefox)...');

// Khởi tạo Firefox handlers
FirefoxProxyHandler.init();
FirefoxAuthHandler.init();

// Khôi phục trạng thái
(async () => {
    try {
        await FirefoxProxyHandler.refreshPacScript();
        const isExtEnabled = await Storage.isExtensionEnabled();
        if (!isExtEnabled) {
            await BadgeManager.reset();
            return;
        }

        const isEnabled = await Storage.isProxyEnabled();
        if (isEnabled) {
            const proxy = await ProxyManager.getActive();
            if (proxy) {
                // console.log(`Restoring proxy: ${proxy.name}`);
                await ProxyConnector.handler.connect(proxy);
                const ipInfo = await IpChecker.getCachedInfo();
                await BadgeManager.updateStatus(true, ipInfo);
                await PrivacyProtector.applyAll(ipInfo);
            } else {
                await BadgeManager.updateStatus(true, null);
            }
        } else {
            await BadgeManager.updateStatus(true, null);
        }
    } catch (error) {
        console.log(`Restore failed: ${error.message}`);
    }
})();

// Message handler
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch(err => {
        // console.log(`Message handler error: ${err.message}`);
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
        case 'ADD_RULE': return await RuleEngine.addRule(data);
        case 'UPDATE_RULE': return await RuleEngine.updateRule(data.id, data);
        case 'REMOVE_RULE': return await RuleEngine.removeRule(data.id);
        case 'GET_PRESET_RULES': return RuleEngine.getPresetRules();
        case 'GET_SETTINGS': return await Storage.getSettings();
        case 'REFRESH_PAC':
            await FirefoxProxyHandler.refreshPacScript();
            return { success: true };
        case 'UPDATE_SETTINGS':
            await Storage.setSettings(data);
            const ipInfo = await IpChecker.getCachedInfo();
            const isEnabled = await Storage.isProxyEnabled();
            if (isEnabled && ipInfo) await PrivacyProtector.applyAll(ipInfo);
            return { success: true };
        case 'GET_SPOOF_DATA':
            const result = await Storage.get('ipf_spoof_data');
            return result.ipf_spoof_data || {};
        default:
            return { error: `Unknown message type: ${type}` };
    }
}

// Alarm auto check IP
browser.alarms.create('ipcheck', { periodInMinutes: 5 });
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'ipcheck') {
        const isEnabled = await Storage.isProxyEnabled();
        const settings = await Storage.getSettings();
        if (isEnabled && settings.autoCheckIp) {
            const ipInfo = await IpChecker.checkIp();
            await BadgeManager.updateStatus(true, ipInfo);
        }
    }
});

// console.log('IPFighter Proxy Manager initialized (Firefox)');