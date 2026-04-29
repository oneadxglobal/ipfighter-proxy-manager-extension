const ProxyConnector = {
  handler: null,
  _checkAbortController: null,

  register(handler) {
    ProxyConnector.handler = handler;
  },

  async connect(proxy) {
    if (!proxy) { return false; }
    if (!ProxyConnector.handler) { return false; }

    try {
      if (ProxyConnector._checkAbortController) {
        ProxyConnector._checkAbortController.abort();
        ProxyConnector._checkAbortController = null;
      }

      await ProxyConnector.handler.connect(proxy);

      await Storage.setActiveProxyId(proxy.id);
      // ✅ FIX 1: Không set false ở đây nữa — để badge hiển thị "đang kết nối"
      // (trước đây set false → icon luôn OFF dù proxy đang connect)

      // ✅ FIX 2: Update badge sang ON ngay lập tức khi bắt đầu connect
      // để user thấy phản hồi ngay, không cần chờ IP check xong
      await BadgeManager.updateStatus(true, null);

      ProxyConnector._notifyChecking(proxy);

      const abortController = new AbortController();
      ProxyConnector._checkAbortController = abortController;

      (async () => {
        try {
          await IpChecker.clearCache();
          const ipInfo = await IpChecker.checkIpWithSignal(abortController.signal);

          if (abortController.signal.aborted) return;

          if (ipInfo && ipInfo.ip && ipInfo.ip !== 'Error' && !ipInfo.error) {
            // Connect thành công
            await Storage.setProxyEnabled(true);
            await ProxyManager.update(proxy.id, {
              status: 'active',
              ip: ipInfo.ip,
              location: [ipInfo.city, ipInfo.country].filter(Boolean).join(', '),
              countryCode: ipInfo.country || ''
            });
            await PrivacyProtector.applyAll(ipInfo);
            // Update badge với thông tin IP đầy đủ
            await BadgeManager.updateStatus(true, ipInfo);
            ProxyConnector._notifyUpdate(true, ipInfo);
            ProxyConnector._notifyToast('success', 'Connected! IP: ' + ipInfo.ip);
          } else {
            // IP check thất bại → disconnect
            await Storage.setProxyEnabled(false);
            await ProxyConnector.handler.disconnect();
            await ProxyManager.update(proxy.id, { status: 'error' });
            await BadgeManager.reset(); // ✅ reset về OFF khi thực sự thất bại
            ProxyConnector._notifyUpdate(false, null);
            ProxyConnector._notifyToast('error', 'Proxy failed: could not connect');
          }
        } catch (err) {
          if (abortController.signal.aborted) return;
          await Storage.setProxyEnabled(false);
          await ProxyManager.update(proxy.id, { status: 'error' });
          await BadgeManager.reset(); // ✅ reset về OFF khi lỗi
          ProxyConnector._notifyUpdate(false, null);
        } finally {
          if (ProxyConnector._checkAbortController === abortController) {
            ProxyConnector._checkAbortController = null;
          }
        }
      })();

      return true;
    } catch (error) {
      return false;
    }
  },

  async disconnect() {
    if (!ProxyConnector.handler) { return false; }

    try {
      if (ProxyConnector._checkAbortController) {
        ProxyConnector._checkAbortController.abort();
        ProxyConnector._checkAbortController = null;
      }

      await ProxyConnector.handler.disconnect();
      await Storage.setProxyEnabled(false);

      const activeId = await Storage.getActiveProxyId();
      if (activeId) {
        const activeProxy = await ProxyManager.getById(activeId);
        if (activeProxy) {
          const prevStatus = activeProxy.ip ? 'active' : 'idle';
          await ProxyManager.update(activeId, { status: prevStatus });
        }
      }

      await PrivacyProtector.clearAll();
      await BadgeManager.reset();
      await IpChecker.clearCache();
      ProxyConnector._notifyUpdate(false, null);

      return true;
    } catch (error) {
      return false;
    }
  },

  async toggle() {
    const isEnabled = await Storage.isProxyEnabled();
    if (isEnabled) {
      return await ProxyConnector.disconnect();
    } else {
      const proxy = await ProxyManager.getActive();
      if (proxy) return await ProxyConnector.connect(proxy);
      return false;
    }
  },

  async switchProxy(proxyId) {
    const proxy = await ProxyManager.getById(proxyId);
    if (!proxy) { return false; }

    if (ProxyConnector.handler) {
      await ProxyConnector.handler.disconnect();
    }

    const oldActiveId = await Storage.getActiveProxyId();
    if (oldActiveId && oldActiveId !== proxyId) {
      const oldProxy = await ProxyManager.getById(oldActiveId);
      if (oldProxy && oldProxy.status !== 'error') {
        await ProxyManager.update(oldActiveId, { status: oldProxy.ip ? 'active' : 'idle' });
      }
    }

    return await ProxyConnector.connect(proxy);
  },

  async getStatus() {
    const isExtEnabled = await Storage.isExtensionEnabled();
    const isEnabled = await Storage.isProxyEnabled();
    const activeProxy = await ProxyManager.getActive();
    const proxyInfo = await IpChecker.getCachedInfo();
    const isChecking = ProxyConnector._checkAbortController !== null;
    return { extensionEnabled: isExtEnabled, enabled: isEnabled, proxy: activeProxy, info: proxyInfo, checking: isChecking };
  },

  _notifyChecking(proxy) {
    try {
      browserAPI.runtime.sendMessage({
        type: 'PROXY_CHECKING',
        data: { proxy }
      }).catch(() => { });
    } catch { }
  },

  _notifyUpdate(enabled, info) {
    try {
      browserAPI.runtime.sendMessage({
        type: 'PROXY_STATUS_UPDATED',
        data: { enabled, info }
      }).catch(() => { });
    } catch { }
  },

  _notifyToast(type, message) {
    try {
      browserAPI.runtime.sendMessage({
        type: 'SHOW_TOAST',
        data: { type, message }
      }).catch(() => { });
    } catch { }
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.ProxyConnector = ProxyConnector;
}