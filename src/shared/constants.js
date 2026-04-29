const PROXY_STATUS = {
  ON: 'on',
  OFF: 'off'
};
const PROXY_TYPES = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4'
};
const IP_CHECK_API = 'https://time.hidemyacc.com/';

const STORAGE_KEYS = {
  PROXIES: 'ipf_proxies',
  ACTIVE_PROXY_ID: 'ipf_active_proxy_id',
  PROXY_ENABLED: 'ipf_proxy_enabled',
  RULES: 'ipf_rules',
  SETTINGS: 'ipf_settings',
  PROXY_INFO: 'ipf_proxy_info'
};

const DEFAULT_SETTINGS = {
  webrtcProtection: true,
  dnsPrefetchDisable: true,
  fakeTimezone: true,
  fakeLanguage: true,
  fakeLocation: true,
  autoCheckIp: true,
  checkIpInterval: 300000,
  bypassList: []
};
const RULE_ACTIONS = {
  PROXY: 'proxy',
  DIRECT: 'direct',
  BLOCK: 'block'
};

const RULE_MATCH_TYPES = {
  DOMAIN: 'domain',
  WILDCARD: 'wildcard',
  REGEX: 'regex',
  CIDR: 'cidr',
  COMBINED: 'combined'
};

const IS_FIREFOX = typeof browser !== 'undefined'
  && !!browser.runtime
  && !!browser.runtime.id
  && typeof browser.proxy !== 'undefined';
const IS_CHROME = !IS_FIREFOX
  && typeof chrome !== 'undefined'
  && !!chrome.runtime
  && !!chrome.runtime.id;

const browserAPI = IS_FIREFOX ? browser : chrome;

if (typeof globalThis !== 'undefined') {
  globalThis.PROXY_STATUS = PROXY_STATUS;
  globalThis.PROXY_TYPES = PROXY_TYPES;
  globalThis.IP_CHECK_API = IP_CHECK_API;
  globalThis.STORAGE_KEYS = STORAGE_KEYS;
  globalThis.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  globalThis.RULE_ACTIONS = RULE_ACTIONS;
  globalThis.RULE_MATCH_TYPES = RULE_MATCH_TYPES;
  globalThis.IS_CHROME = IS_CHROME;
  globalThis.IS_FIREFOX = IS_FIREFOX;
  globalThis.browserAPI = browserAPI;
}