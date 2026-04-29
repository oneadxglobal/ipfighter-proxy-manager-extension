const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ICONS = path.join(ROOT, 'icons');
const MANIFESTS = path.join(ROOT, 'manifests');
const LIBS = path.join(ROOT, 'libs');

const target = process.argv[2] || 'all';

function copyDir(src, dest, excludes = []) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (excludes.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function buildChrome() {
  console.log('Building for Chrome MV3...');
  const chromeDir = path.join(DIST, 'chrome');
  removeDir(chromeDir);

  copyDir(SRC, chromeDir, ['platform']);

  const chromePlatform = path.join(SRC, 'platform', 'chrome');
  const destPlatform = path.join(chromeDir, 'platform');
  if (fs.existsSync(chromePlatform)) {
    copyDir(chromePlatform, destPlatform);
  }

  copyDir(ICONS, path.join(chromeDir, 'icons'));

  if (fs.existsSync(LIBS)) copyDir(LIBS, path.join(chromeDir, 'libs'));

  fs.copyFileSync(
    path.join(MANIFESTS, 'chrome', 'manifest.json'),
    path.join(chromeDir, 'manifest.json')
  );

  console.log('Chrome build completed: dist/chrome/');
}

function buildFirefox() {
  console.log('Building for Firefox...');
  const firefoxDir = path.join(DIST, 'firefox');
  removeDir(firefoxDir);

  copyDir(SRC, firefoxDir, ['platform']);

  const firefoxPlatform = path.join(SRC, 'platform', 'firefox');
  const destPlatform = path.join(firefoxDir, 'platform');
  if (fs.existsSync(firefoxPlatform)) {
    copyDir(firefoxPlatform, destPlatform);
  }

  copyDir(ICONS, path.join(firefoxDir, 'icons'));

  if (fs.existsSync(LIBS)) copyDir(LIBS, path.join(firefoxDir, 'libs'));

  fs.copyFileSync(
    path.join(MANIFESTS, 'firefox', 'manifest.json'),
    path.join(firefoxDir, 'manifest.json')
  );

  console.log('Firefox build completed: dist/firefox/');
}

if (target === 'chrome') {
  buildChrome();
} else if (target === 'firefox') {
  buildFirefox();
} else {
  buildChrome();
  buildFirefox();
  console.log('\nAll builds completed!');
}