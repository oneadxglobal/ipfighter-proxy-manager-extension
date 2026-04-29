# IPFighter Proxy Manager

IPFighter Proxy Manager is a professional, cross-browser proxy management extension built for Chrome (Manifest V3) and Firefox. It provides advanced proxy routing, privacy protection, and a smart, rule-based filtering engine.

## Features

- **Multi-Proxy Management:** Easily add, edit, delete, and switch between multiple proxies (HTTP, HTTPS, SOCKS4, SOCKS5).
- **Proxy Authentication:** Supports username and password authentication for proxies.
- **Smart Rule Engine:** Route traffic based on domains, URL patterns, Regex, Wildcards, and even CIDR ranges. 
- **Privacy Spoofing:** Advance Anti-Detect features that spoof Timezone, Language, and Geolocation based on the connected proxy.
- **WebRTC & DNS Leak Protection:** Strictly forces WebRTC traffic over the proxy and disables DNS prefetching to ensure maximum privacy.
- **Cross-Browser Compatibility:** Designed with a unified codebase to cleanly build for both Chrome (MV3) and Firefox (MV2).
- **Modern UI:** Features a sleek, responsive Glassmorphism design in both the popup and settings page.

## Installation

### For Chrome
1. Go to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist/chrome` folder from this repository.

### For Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file inside the `dist/firefox` folder.

## Detailed Usage Guide

### 1. Basic Proxy Management
- **Toggle Proxy:** Click on the extension icon and use the toggle switch at the top right to quickly turn the proxy connection on or off.
- **Add a New Proxy:** 
  - In the Popup interface, click the **"Add proxy"** button.
  - Select the protocol: In the current version, Chrome only allows configuration with the HTTP protocol.
  - Select the input format (e.g., `host:port:username:pass`).
  - Enter the proxy details. You can also set an **Expired date**, **Tag**, and **Note** for better management.
  - Click **"Add Proxy"** to save.
- **Using a Proxy:** From the proxy list, select any proxy to connect. You can also quickly access proxies in the **Recently Used** or **Pinned** tabs.

### 2. Smart Rules Setup
The Rule Engine allows you to flexibly route proxy traffic without enabling the proxy for the entire browser.
- Open **Smart Rules** from the Popup interface or the Options page.
- Add new rules to specify which **Domain**, **Wildcard (*.example.com)**, or **Regex** should go through a specific proxy, or use a direct connection (Direct/Bypass).

### 3. Settings & Anti-Detect (Privacy Protection)
Access the **Settings** section to enable/disable advanced security features:
- **WebRTC Protection:** Prevent actual IP leaks through the WebRTC protocol (highly recommended).
- **DNS Leak Protection:** Disable DNS Prefetching.
- **Timezone Spoofing:** Automatically sync the browser's timezone with the proxy's timezone.
- **Language Spoofing:** Automatically change the browser's language to match the proxy's location.
- **Geolocation Spoofing:** Simulate geolocation coordinates based on the proxy's IP.

## Build Setup

To modify or rebuild the extension for both platforms, make sure you have [Node.js](https://nodejs.org/) installed.

```bash
# Install dependencies
npm install

# Build the extension (compiles to dist/chrome and dist/firefox)
npm run build
```

## Privacy & Security

IPFighter goes beyond simple proxy connection by actively intercepting browser APIs (like `Intl.DateTimeFormat`, `Date.getTimezoneOffset`, `navigator.language`, and `navigator.geolocation`) at the execution start of every webpage, guaranteeing 100% synchronization between your active proxy's physical location and your browser's fingerprint footprint. 

## License
MIT License
