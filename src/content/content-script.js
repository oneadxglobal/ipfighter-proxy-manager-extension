
const isFirefox = typeof browser !== 'undefined'
  && typeof browser.proxy !== 'undefined';

if (!isFirefox) {
} else {
  browser.storage.local.get('ipf_spoof_data', (result) => {
    const data = result.ipf_spoof_data;
    if (!data || Object.keys(data).length === 0) return;

    const scriptContent = `
      (function() {
        'use strict';
        const spoofData = ${JSON.stringify(data)};

        // 1. Timezone
        if (spoofData.timezone) {
          const orig = Intl.DateTimeFormat.prototype.resolvedOptions;
          Intl.DateTimeFormat.prototype.resolvedOptions = function() {
            const o = orig.call(this);
            o.timeZone = spoofData.timezone;
            return o;
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
          if (off !== null) Date.prototype.getTimezoneOffset = function() { return off; };
        }

        // 2. Language
        if (spoofData.languages) {
          const langs = spoofData.languages.split(',').map(l => l.trim()).filter(Boolean);
          if (langs.length > 0) {
            const full = [];
            for (const l of langs) {
              full.push(l);
              if (l.length === 2) full.push(l + '-' + l.toUpperCase());
            }
            if (!full.includes('en')) full.push('en', 'en-US');
            Object.defineProperty(navigator, 'language', { get: () => full[0], configurable: true });
            Object.defineProperty(navigator, 'languages', { get: () => Object.freeze([...full]), configurable: true });
          }
        }

        // 3. Location
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
            navigator.geolocation.watchPosition = (s) => {
              if (s) s(fakePos);
              return Math.floor(Math.random() * 10000);
            };
          }
        }
      })();
    `;

    const script = document.createElement('script');
    script.textContent = scriptContent;
    const parent = document.head || document.documentElement;
    if (parent) {
      parent.prepend(script);
      script.remove();
    }
  });
}