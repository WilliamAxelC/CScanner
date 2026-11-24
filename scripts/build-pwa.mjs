import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');
const basePath = (process.env.EXPO_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, env: process.env });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 1. Export Expo Web single-page bundle (clean dist first)
fs.rmSync(distDir, { recursive: true, force: true });
run('npx expo export --platform web');

// 2. Ensure public/ manifest and icons exist inside dist/
copyDir(publicDir, distDir);

// 3. Rewrite manifest.json for subpath hosting if EXPO_PUBLIC_BASE_URL is set
const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const scopePrefix = basePath ? `${basePath}/` : '/';
  manifest.start_url = scopePrefix;
  manifest.scope = scopePrefix;
  if (Array.isArray(manifest.icons)) {
    manifest.icons = manifest.icons.map((icon) => {
      const cleanSrc = String(icon.src || '').replace(/^\/+/, '');
      const rel = cleanSrc.startsWith(`${basePath.replace(/^\/+/, '')}/`)
        ? `/${cleanSrc}`
        : `${basePath}/${cleanSrc}`;
      return { ...icon, src: rel };
    });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// 4. Inject manifest link, theme-color, favicon subpath fix, and service worker registration into dist/index.html
const indexPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('dist/index.html not found after expo export');
}

let html = fs.readFileSync(indexPath, 'utf8');
if (basePath) {
  html = html.replace(
    'href="/favicon.ico"',
    `href="${basePath}/favicon.ico"`,
  );
}

const manifestUrl = `${basePath}/manifest.json`;
const icon192Url = `${basePath}/icons/icon-192.png`;
const swUrl = `${basePath}/sw.js`;
const swScope = basePath ? `${basePath}/` : '/';

if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '</head>',
    `  <link rel="manifest" href="${manifestUrl}" />\n  <meta name="theme-color" content="#0D9488" />\n  <link rel="apple-touch-icon" href="${icon192Url}" />\n</head>`,
  );
}
if (!html.includes('serviceWorker')) {
  html = html.replace(
    '</body>',
    `  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('${swUrl}', { scope: '${swScope}' }).catch(function (err) {
          console.warn('SW registration failed:', err);
        });
      });
    }
  </script>\n</body>`,
  );
}
fs.writeFileSync(indexPath, html, 'utf8');

// 5. Generate offline Workbox service worker
run('npx workbox-cli generateSW workbox-config.js');
console.log(`PWA build complete in dist/ (basePath="${basePath || '/'}")`);
