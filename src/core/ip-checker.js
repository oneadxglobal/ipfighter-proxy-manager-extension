/**
 * IP Checker - Kiểm tra IP thực tế qua proxy
 */

const IpChecker = {
  _cache: null,
  _lastCheck: 0,

  async checkIp() {
    return IpChecker.checkIpWithSignal(null);
  },
  async checkIpWithSignal(signal) {
    let timeoutId;
    let fallbackController = null;
    
    try {
      const fetchOptions = { method: 'GET', cache: 'no-cache' };
      
      // Khởi tạo một AbortController riêng cho timeout
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      fallbackController = controller;

      // Nếu user/hệ thống truyền signal vào, thì khi signal đó bị abort -> abort luôn controller cục bộ
      if (signal) {
        if (signal.aborted) throw new Error('Aborted');
        signal.addEventListener('abort', () => controller.abort());
      }
      
      // Strict Timeout 10000ms
      timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);

      const response = await fetch(IP_CHECK_API, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`API returned ${response.status}`);

      const data = await response.json();
      const info = {
        ip: data.ip || 'Unknown',
        country: data.country || '',
        countryCode: data.country || '',
        stateProv: data.stateProv || '',
        city: data.city || '',
        timezone: data.timezone || '',
        latitude: data.ll ? parseFloat(data.ll[0]) : 0,
        longitude: data.ll ? parseFloat(data.ll[1]) : 0,
        languages: data.languages || '',
        accuracy: data.accuracy || 0,
        checkedAt: Date.now()
      };

      IpChecker._cache = info;
      IpChecker._lastCheck = Date.now();
      await Storage.setProxyInfo(info);

      return info;
    } catch (error) {
      return {
        ip: 'Error',
        country: '',
        city: '',
        timezone: '',
        latitude: 0,
        longitude: 0,
        languages: '',
        checkedAt: Date.now(),
        error: error.message
      };
    }
  },

  async getCachedInfo() {
    if (IpChecker._cache) return IpChecker._cache;
    const stored = await Storage.getProxyInfo();
    if (stored) { IpChecker._cache = stored; return stored; }
    return null;
  },

  async clearCache() {
    IpChecker._cache = null;
    IpChecker._lastCheck = 0;
    try {
      await Storage.setProxyInfo(null);
    } catch(e) {}
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.IpChecker = IpChecker;
}