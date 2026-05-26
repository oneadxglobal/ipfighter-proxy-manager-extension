
const RuleEngine = {
  async evaluate(requestDetails) {
    const rules = await Storage.getRules();
    const enabledRules = rules.filter(r => r.enabled);
    enabledRules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    for (const rule of enabledRules) {
      if (RuleEngine.matchRule(rule, requestDetails)) {
        return {
          matched: true,
          rule: rule,
          action: rule.action,
          proxyId: rule.proxyId
        };
      }
    }

    return { matched: false, action: null, proxyId: null };
  },

  evaluateSync(requestDetails, rules, proxies, defaultProxy, compiledBypass) {
    const url = requestDetails.url || '';
    let hostname = '';

    try {
      hostname = new URL(url).hostname;
    } catch { }

    for (const entry of compiledBypass || []) {
      if (RuleEngine.matchBypassEntry(url, hostname, entry)) {
        return { matched: true, action: 'direct' };
      }
    }

    const enabledRules = rules.filter(r => r.enabled);
    enabledRules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    for (const rule of enabledRules) {
      if (RuleEngine.matchRule(rule, requestDetails)) {
        return {
          matched: true,
          rule: rule,
          action: rule.action,
          proxyId: rule.proxyId
        };
      }
    }

    return { matched: false, action: null, proxyId: null };
  },

  matchRule(rule, request) {
    const url = request.url || '';
    let hostname = '';
    let port = '';

    try {
      const urlObj = new URL(url);
      hostname = urlObj.hostname;
      port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    } catch {
      return false;
    }

    const method = (request.method || 'GET').toUpperCase();
    const conditions = rule.conditions || [];

    if (conditions.length === 0) {
      return RuleEngine.matchPattern(rule, hostname, url);
    }

    return conditions.every(cond => {
      switch (cond.type) {
        case 'domain':
          return RuleEngine.matchDomain(cond.value, hostname);
        case 'url':
          return RuleEngine.matchUrlPattern(cond.value, url);
        case 'port':
          return String(port) === String(cond.value);
        case 'method':
          return method === cond.value.toUpperCase();
        case 'cidr':
          return Utils.isIpInCidr(hostname, cond.value);
        default:
          return false;
      }
    });
  },

  matchPattern(rule, hostname, url) {
    const pattern = rule.pattern || '';
    if (!pattern) return false;

    switch (rule.matchType) {
      case RULE_MATCH_TYPES.REGEX:
        return RuleEngine.matchRegex(pattern, url);
      case RULE_MATCH_TYPES.WILDCARD:
        return Utils.matchWildcard(hostname, pattern);
      case RULE_MATCH_TYPES.CIDR:
        return Utils.isIpInCidr(hostname, pattern);
      case RULE_MATCH_TYPES.DOMAIN:
      default:
        return RuleEngine.matchDomain(pattern, hostname);
    }
  },

  matchDomain(pattern, hostname) {
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.slice(2);
      return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
    }
    return hostname === pattern;
  },

  matchRegex(pattern, url) {
    try {
      const regexStr = pattern.startsWith('/') && pattern.endsWith('/')
        ? pattern.slice(1, -1)
        : pattern;
      const regex = new RegExp(regexStr, 'i');
      return regex.test(url);
    } catch {
      return false;
    }
  },
  matchUrlPattern(pattern, url) {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      return RuleEngine.matchRegex(pattern, url);
    }
    return Utils.matchWildcard(url, pattern);
  },

  compileBypassList(entries) {
    const compiled = [];
    for (const entry of entries) {
      const e = entry.trim();
      if (!e || e.startsWith('#')) continue;

      if (e.startsWith('/') && e.lastIndexOf('/') > 0) {
        try {
          const regexStr = e.slice(1, e.lastIndexOf('/'));
          const flags = e.slice(e.lastIndexOf('/') + 1);
          compiled.push({ type: 'regex', regex: new RegExp(regexStr, flags || 'i'), raw: e });
        } catch { /* bỏ qua regex lỗi */ }
        continue;
      }
      if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(e)) {
        compiled.push({ type: 'cidr', cidr: e, raw: e });
        continue;
      }
      if (e.startsWith('*.')) {
        compiled.push({ type: 'wildcard', base: e.slice(2).toLowerCase(), raw: e });
        continue;
      }
      compiled.push({ type: 'domain', domain: e.toLowerCase(), raw: e });
    }
    return compiled;
  },


  matchBypassEntry(url, host, compiledEntry) {
    switch (compiledEntry.type) {
      case 'regex':
        return compiledEntry.regex.test(url);

      case 'cidr':
        try { return Utils.isIpInCidr(host, compiledEntry.cidr); } catch { return false; }

      case 'wildcard':
        return host === compiledEntry.base || host.endsWith('.' + compiledEntry.base);

      case 'domain':
        return host === compiledEntry.domain || host.endsWith('.' + compiledEntry.domain);

      default:
        return false;
    }
  },

  async generatePacScript(defaultProxy, sessionId = null) {
    const rules = await Storage.getRules();
    const enabledRules = rules.filter(r => r.enabled);
    const proxies = await Storage.getProxies();
    const settings = await Storage.getSettings();
    const bypassList = settings.bypassMode === 'default' ? [] : (settings.bypassList || []);

    const compiledBypass = RuleEngine.compileBypassList(bypassList);

    let bypassLines = '';
    for (const entry of compiledBypass) {
      if (entry.type === 'regex') {
        bypassLines += '  if (' + entry.regex.toString() + '.test(url)) return "DIRECT";\n';
      } else if (entry.type === 'cidr') {
        const ip = entry.cidr.split('/')[0];
        const mask = RuleEngine._cidrToMask(entry.cidr);
        bypassLines += '  if (isInNet(host, "' + ip + '", "' + mask + '")) return "DIRECT";\n';
      } else if (entry.type === 'wildcard') {
        bypassLines += '  if (host === "' + entry.base + '" || dnsDomainIs(host, ".' + entry.base + '")) return "DIRECT";\n';
      } else if (entry.type === 'domain') {
        bypassLines += '  if (host === "' + entry.domain + '" || dnsDomainIs(host, ".' + entry.domain + '")) return "DIRECT";\n';
      }
    }

    let pac = 'function FindProxyForURL(url, host) {\n';
    if (sessionId) {
      pac += '  // Session ID: ' + sessionId + '\n';
    }
    pac += '  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || isPlainHostName(host)) return "DIRECT";\n';
    pac += '  host = host.toLowerCase();\n';

    if (bypassLines) {
      pac += '  // BYPASS LIST\n';
      pac += bypassLines;
    }

    enabledRules.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    if (enabledRules.length > 0) {
      pac += '  // SMART RULES\n';
      for (const rule of enabledRules) {
        const proxyStr = RuleEngine._getProxyString(rule, proxies, defaultProxy);
        const condition = RuleEngine._buildPacCondition(rule);
        if (condition && proxyStr) {
          pac += '  if (' + condition + ') return "' + proxyStr + '";\n';
        }
      }
    }

    if (defaultProxy) {
      pac += '  return "' + RuleEngine._proxyToPacString(defaultProxy) + '";\n';
    } else {
      pac += '  return "DIRECT";\n';
    }
    pac += '}';
    return pac;
  },

  _getProxyString(rule, proxies, defaultProxy) {
    if (rule.action === RULE_ACTIONS.DIRECT) return 'DIRECT';
    if (rule.action === RULE_ACTIONS.BLOCK) return 'PROXY 0.0.0.0:1';

    if (rule.proxyId) {
      const proxy = proxies.find(p => p.id === rule.proxyId);
      if (proxy) return RuleEngine._proxyToPacString(proxy);
    }

    if (defaultProxy) return RuleEngine._proxyToPacString(defaultProxy);
    return 'DIRECT';
  },

  _proxyToPacString(proxy) {
    if (proxy.type === PROXY_TYPES.SOCKS5 || proxy.type === 'socks') {
      return `SOCKS5 ${proxy.host}:${proxy.port}; SOCKS ${proxy.host}:${proxy.port}`;
    }
    if (proxy.type === PROXY_TYPES.SOCKS4) {
      return `SOCKS ${proxy.host}:${proxy.port}`;
    }
    return `PROXY ${proxy.host}:${proxy.port}`;
  },

  _buildPacCondition(rule) {
    const conditions = rule.conditions || [];

    if (conditions.length === 0) {
      return RuleEngine._patternToPac(rule);
    }

    const parts = conditions.map(cond => {
      switch (cond.type) {
        case 'domain':
          if (cond.value.startsWith('*.')) {
            const base = cond.value.slice(2);
            return `(host === "${base}" || dnsDomainIs(host, ".${base}"))`;
          }
          return `host === "${cond.value}"`;
        case 'port':
          return `url.split(":")[2] && url.split(":")[2].startsWith("${cond.value}")`;
        default:
          return null;
      }
    }).filter(Boolean);

    return parts.length > 0 ? parts.join(' && ') : null;
  },

  _patternToPac(rule) {
    const pattern = rule.pattern || '';
    if (!pattern) return null;

    switch (rule.matchType) {
      case RULE_MATCH_TYPES.WILDCARD:
        if (pattern.startsWith('*.')) {
          const base = pattern.slice(2);
          return `dnsDomainIs(host, ".${base}") || host === "${base}"`;
        }
        return `shExpMatch(host, "${pattern}")`;
      case RULE_MATCH_TYPES.REGEX:
        const regexStr = pattern.startsWith('/') && pattern.endsWith('/')
          ? pattern.slice(1, -1)
          : pattern;
        return `new RegExp("${regexStr.replace(/"/g, '\\"')}", "i").test(url)`;
      case RULE_MATCH_TYPES.CIDR:
        return `isInNet(host, "${pattern.split('/')[0]}", "${RuleEngine._cidrToMask(pattern)}")`;
      case RULE_MATCH_TYPES.DOMAIN:
      default:
        return `host === "${pattern}" || dnsDomainIs(host, ".${pattern}")`;
    }
  },

  _cidrToMask(cidr) {
    const bits = parseInt(cidr.split('/')[1]);
    const mask = [];
    for (let i = 0; i < 4; i++) {
      const n = Math.min(8, Math.max(0, bits - i * 8));
      mask.push(256 - Math.pow(2, 8 - n));
    }
    return mask.join('.');
  },

  async addRule(ruleData) {
    const rules = await Storage.getRules();
    const rule = {
      id: Utils.generateId(),
      name: ruleData.name || 'Unnamed Rule',
      enabled: ruleData.enabled !== false,
      matchType: ruleData.matchType || RULE_MATCH_TYPES.DOMAIN,
      pattern: ruleData.pattern || '',
      conditions: ruleData.conditions || [],
      action: ruleData.action || RULE_ACTIONS.PROXY,
      proxyId: ruleData.proxyId || null,
      priority: ruleData.priority || rules.length + 1,
      createdAt: Date.now()
    };
    rules.push(rule);
    await Storage.setRules(rules);
    return rule;
  },

  async updateRule(id, data) {
    const rules = await Storage.getRules();
    const index = rules.findIndex(r => r.id === id);
    if (index === -1) return null;

    rules[index] = { ...rules[index], ...data, id };
    await Storage.setRules(rules);
    return rules[index];
  },

  async removeRule(id) {
    let rules = await Storage.getRules();
    rules = rules.filter(r => r.id !== id);
    await Storage.setRules(rules);
    return true;
  },

  getPresetRules() {
    return [
      {
        name: 'Bypass Local Network',
        matchType: RULE_MATCH_TYPES.CIDR,
        pattern: '192.168.0.0/16',
        action: RULE_ACTIONS.DIRECT,
        priority: 1
      },
      {
        name: 'Bypass Localhost',
        matchType: RULE_MATCH_TYPES.DOMAIN,
        pattern: 'localhost',
        action: RULE_ACTIONS.DIRECT,
        priority: 1
      },
      {
        name: 'Block Ads - DoubleClick',
        matchType: RULE_MATCH_TYPES.WILDCARD,
        pattern: '*.doubleclick.net',
        action: RULE_ACTIONS.BLOCK,
        priority: 5
      },
      {
        name: 'Google Services Direct',
        matchType: RULE_MATCH_TYPES.WILDCARD,
        pattern: '*.google.com',
        action: RULE_ACTIONS.DIRECT,
        priority: 10
      }
    ];
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.RuleEngine = RuleEngine;
}