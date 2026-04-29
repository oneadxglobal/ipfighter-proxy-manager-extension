
const Utils = {
  generateId() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      Math.floor(Math.random() * 16).toString(16)
    );
  },

  /**
   * Parse proxy string thành object
   * Hỗ trợ các formats:
   *   1. protocol://user:pass@host:port
   *   2. host:port
   *   3. host:port:username:pass
   *   4. host:port@username:pass
   *   5. username:pass:host:port
   *   6. username:pass@host:port
   */
  parseProxyString(str) {
    str = str.trim();
    if (!str) return null;

    const urlMatch = str.match(/^(https?|socks[45]?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/i);
    if (urlMatch) {
      return {
        type: urlMatch[1].toLowerCase().replace(/^socks$/, 'socks5'),
        host: urlMatch[4],
        port: parseInt(urlMatch[5]),
        username: urlMatch[2] || '',
        password: urlMatch[3] || ''
      };
    }

    const isPort = (val) => /^\d{1,5}$/.test(val) && parseInt(val) > 0 && parseInt(val) <= 65535;
    const isHost = (val) => /^[\w\.\-]+$/.test(val);

    if (str.includes('@')) {
      const atIdx = str.indexOf('@');
      const before = str.substring(0, atIdx);  // trước @
      const after = str.substring(atIdx + 1);  // sau @

      const beforeParts = before.split(':');
      const afterParts = after.split(':');

      if (beforeParts.length === 2 && isHost(beforeParts[0]) && isPort(beforeParts[1])) {
        return {
          type: 'http',
          host: beforeParts[0],
          port: parseInt(beforeParts[1]),
          username: afterParts[0] || '',
          password: afterParts[1] || ''
        };
      }

      if (afterParts.length === 2 && isHost(afterParts[0]) && isPort(afterParts[1])) {
        return {
          type: 'http',
          host: afterParts[0],
          port: parseInt(afterParts[1]),
          username: beforeParts[0] || '',
          password: beforeParts[1] || ''
        };
      }
    }

    const parts = str.split(':');

    if (parts.length === 2 && isHost(parts[0]) && isPort(parts[1])) {
      return {
        type: 'http',
        host: parts[0],
        port: parseInt(parts[1]),
        username: '',
        password: ''
      };
    }
    if (parts.length === 4 && isHost(parts[0]) && isPort(parts[1])) {
      return {
        type: 'http',
        host: parts[0],
        port: parseInt(parts[1]),
        username: parts[2] || '',
        password: parts[3] || ''
      };
    }
    if (parts.length === 4 && isHost(parts[2]) && isPort(parts[3])) {
      return {
        type: 'http',
        host: parts[2],
        port: parseInt(parts[3]),
        username: parts[0] || '',
        password: parts[1] || ''
      };
    }
    if (parts.length >= 2 && isPort(parts[1])) {
      return {
        type: 'http',
        host: parts[0],
        port: parseInt(parts[1]),
        username: parts[2] || '',
        password: parts[3] || ''
      };
    }

    return null;
  },

  formatProxy(proxy) {
    if (!proxy) return 'No proxy';
    const auth = proxy.username ? `${proxy.username}@` : '';
    return `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
  },

  isIpInCidr(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = Utils.ipToNumber(ip);
    const rangeNum = Utils.ipToNumber(range);
    return (ipNum & mask) === (rangeNum & mask);
  },

  ipToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  },

  matchWildcard(domain, pattern) {
    const regex = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
      'i'
    );
    return regex.test(domain);
  },

  getCountryFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 0x1F1E6 + char.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  },

  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  matchUrl(url, pattern) {
    try {
      const urlObj = new URL(url);
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1), 'i');
        return regex.test(url);
      }
      if (pattern.includes('*')) {
        return Utils.matchWildcard(urlObj.hostname, pattern);
      }
      return urlObj.hostname === pattern || urlObj.hostname.endsWith('.' + pattern);
    } catch {
      return false;
    }
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.Utils = Utils;
}