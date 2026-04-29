
const PrivacyProtector = {
  async applyAll(proxyInfo) {
    const settings = await Storage.getSettings();

    if (settings.webrtcProtection) {
      await PrivacyProtector.disableWebRTC();
    } else {
      await PrivacyProtector.enableWebRTC();
    }

    if (proxyInfo) {
      const spoofData = {};
      if (settings.fakeTimezone && proxyInfo.timezone) {
        spoofData.timezone = proxyInfo.timezone;
      }
      if (settings.fakeLanguage && proxyInfo.languages) {
        spoofData.languages = proxyInfo.languages;
      }
      if (settings.fakeLocation && proxyInfo.latitude) {
        spoofData.latitude = proxyInfo.latitude;
        spoofData.longitude = proxyInfo.longitude;
        spoofData.accuracy = proxyInfo.accuracy || 100;
      }
      await Storage.set({ ipf_spoof_data: spoofData });
    }

  },

  async clearAll() {
    await PrivacyProtector.enableWebRTC();
    await Storage.set({ ipf_spoof_data: {} });
  },

  async disableWebRTC() {
    try {
      if (typeof chrome !== 'undefined' && chrome.privacy?.network) {
        const network = chrome.privacy.network;

        if (network.webRTCIPHandlingPolicy) {
          await new Promise((resolve, reject) => {
            network.webRTCIPHandlingPolicy.set(
              { value: 'disable_non_proxied_udp' },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }

        if (network.webRTCMultipleRoutesEnabled) {
          await new Promise((resolve, reject) => {
            network.webRTCMultipleRoutesEnabled.set(
              { value: false },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }

        if (network.webRTCNonProxiedUdpEnabled) {
          await new Promise((resolve, reject) => {
            network.webRTCNonProxiedUdpEnabled.set(
              { value: false },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }

      } else if (typeof browser !== 'undefined' && browser.privacy?.network?.peerConnectionEnabled) {
        await browser.privacy.network.peerConnectionEnabled.set({ value: false });
      }
    } catch (error) {
      console.log(`WebRTC protection failed: ${error.message}`);
    }
  },

  async enableWebRTC() {
    try {
      if (typeof chrome !== 'undefined' && chrome.privacy?.network) {
        const network = chrome.privacy.network;

        if (network.webRTCIPHandlingPolicy) {
          await new Promise((resolve, reject) => {
            network.webRTCIPHandlingPolicy.set(
              { value: 'default' },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }

        if (network.webRTCMultipleRoutesEnabled) {
          await new Promise((resolve, reject) => {
            network.webRTCMultipleRoutesEnabled.set(
              { value: true },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }

        if (network.webRTCNonProxiedUdpEnabled) {
          await new Promise((resolve, reject) => {
            network.webRTCNonProxiedUdpEnabled.set(
              { value: true },
              () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()
            );
          });
        }
      } else if (typeof browser !== 'undefined' && browser.privacy?.network?.peerConnectionEnabled) {
        await browser.privacy.network.peerConnectionEnabled.set({ value: true });
      }
    } catch (error) {
      console.log(`WebRTC restore failed: ${error.message}`);
    }
  },
};

if (typeof globalThis !== 'undefined') {
  globalThis.PrivacyProtector = PrivacyProtector;
}