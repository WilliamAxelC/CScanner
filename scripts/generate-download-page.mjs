import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function escapeHtml(val) {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const root = process.cwd();
const apkInput = path.resolve(
  root,
  process.argv[2] || 'build-output/CScanner-release.apk',
);
const outDir = path.resolve(root, process.argv[3] || 'dist/download');
const basePath = (process.env.EXPO_PUBLIC_BASE_URL || '/projects/cscanner').replace(
  /\/+$/,
  '',
);

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const appCfg = JSON.parse(
  fs.readFileSync(path.join(root, 'app.json'), 'utf8'),
);
const version = pkg.version || appCfg.expo?.version || '1.1.0';
const versionCode = appCfg.expo?.android?.versionCode || 2;
const packageId = appCfg.expo?.android?.package || 'com.cscanner.app';
const apkFileName = `cscanner-${version}.apk`;

if (!fs.existsSync(apkInput)) {
  throw new Error(`APK not found at ${apkInput}`);
}

fs.mkdirSync(outDir, { recursive: true });

const apkBytes = fs.readFileSync(apkInput);
const sha256 = crypto.createHash('sha256').update(apkBytes).digest('hex');
const sizeMB = (apkBytes.length / (1024 * 1024)).toFixed(1);
const builtAt = new Date().toISOString();

fs.writeFileSync(path.join(outDir, apkFileName), apkBytes);

const iconSrc = path.join(root, 'public/icons/icon-192.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(outDir, 'icon-192.png'));
}

const releaseNotes = [
  'Added production Accessibility panel (Text Size, High Contrast WCAG AAA palette, Reduce Motion, confirmation toggles)',
  'Added App Info screen with live update check, storage breakdown, cache cleanup, and sanitized diagnostics',
  'Added Bug Reports, Feature Requests, and transparent Privacy screens',
  'Security hardening: real pixel & OCR redaction burning, native Kotlin URI/bitmap confinement, memory-only web OAuth, allowBackup=false, strict nginx security headers',
];

const versionMeta = {
  name: 'CScanner',
  version,
  versionCode,
  packageId,
  date: builtAt.slice(0, 10),
  url: `https://cuang.dev${basePath}/download/`,
  notes: releaseNotes,
  apk: {
    url: `https://cuang.dev${basePath}/download/${apkFileName}`,
    sha256,
    sizeBytes: apkBytes.length,
  },
  fileName: apkFileName,
  sizeBytes: apkBytes.length,
  sizeLabel: `${sizeMB} MB`,
  sha256,
  builtAt,
  pwaUrl: `${basePath}/`,
  downloadUrl: `${basePath}/download/${apkFileName}`,
  releaseNotes,
};
fs.writeFileSync(
  path.join(outDir, 'version.json'),
  JSON.stringify(versionMeta, null, 2) + '\n',
  'utf8',
);

const safeVersion = escapeHtml(version);
const safeSizeMB = escapeHtml(sizeMB);
const safeApkFileName = escapeHtml(apkFileName);
const safePackageId = escapeHtml(packageId);
const safeDate = escapeHtml(builtAt.slice(0, 10));
const safeSha256 = escapeHtml(sha256);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CScanner | Ad-Free Document Scanner (Android APK &amp; Web PWA)</title>
  <meta name="description" content="Ad-free, offline-first CamScanner replacement for Android (ML Kit + on-device OCR + AES-256 PDF) and Web PWA with optional Google Drive sync." />
  <link rel="icon" href="icon-192.png" />
  <style>
    :root {
      --bg: #090d16; --card: #111827; --border: #1f2937; --text: #f9fafb; --muted: #9ca3af;
      --primary: #0d9488; --primary-ink: #ffffff; --accent: #14b8a6; --amber: #f59e0b;
    }
    @media (prefers-color-scheme: light) {
      :root { --bg: #f8fafc; --card: #ffffff; --border: #e5e7eb; --text: #0f172a; --muted: #475569; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.55; }
    main { max-width: 780px; margin: 0 auto; padding: 48px 16px 64px; }
    header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    header img { width: 72px; height: 72px; border-radius: 18px; }
    h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; }
    .tagline { color: var(--muted); font-size: 16px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 22px; margin-bottom: 18px; }
    .download { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; justify-content: space-between; }
    .btn-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .btn { display: inline-flex; align-items: center; gap: 9px; background: var(--primary); color: var(--primary-ink);
      font-weight: 700; font-size: 15px; padding: 13px 20px; border-radius: 999px; text-decoration: none; }
    .btn:hover { filter: brightness(1.08); }
    .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .meta { color: var(--muted); font-size: 13px; margin-top: 12px; }
    .meta code, .sha { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
    h2 { font-size: 18px; margin-bottom: 12px; }
    ul, ol { padding-left: 20px; }
    li { margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .feature { border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
    .feature h3 { font-size: 15px; margin-bottom: 4px; }
    .feature p { color: var(--muted); font-size: 14px; }
    .note { border-left: 3px solid var(--amber); padding-left: 12px; color: var(--muted); font-size: 14px; margin-top: 12px; }
    footer { color: var(--muted); font-size: 13px; text-align: center; margin-top: 32px; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <header>
      <img src="icon-192.png" alt="CScanner icon" />
      <div>
        <h1>CScanner</h1>
        <p class="tagline">Ad-free, offline-first document scanner for Android &amp; Web</p>
      </div>
    </header>

    <section class="card">
      <div class="download">
        <div>
          <strong style="font-size: 18px;">Android APK &amp; Web PWA</strong>
          <div style="color: var(--muted); font-size: 14px;">Version ${safeVersion} (build ${versionCode}) &middot; ${safeSizeMB} MB &middot; Zero ads or tracking</div>
        </div>
        <div class="btn-row">
          <a class="btn" href="${safeApkFileName}" download>Download APK (v${safeVersion})</a>
          <a class="btn btn-secondary" href="../">Open Web PWA</a>
        </div>
      </div>
      <div class="meta">
        <div>Package: <code>${safePackageId}</code> &middot; Built: <code>${safeDate}</code></div>
        <div style="margin-top: 4px;">SHA-256: <span class="sha">${safeSha256}</span></div>
      </div>
    </section>

    <section class="card">
      <h2>What&rsquo;s inside</h2>
      <div class="grid">
        <div class="feature">
          <h3>Native ML Kit Scanning</h3>
          <p>Auto-edge detection, perspective warp, ID Card Front+Back A4 sheets, and gallery import.</p>
        </div>
        <div class="feature">
          <h3>Lossless Enhancements</h3>
          <p>Magic Color, Crisp B&amp;W adaptive thresholding, Grayscale, Lighten, brightness &amp; contrast.</p>
        </div>
        <div class="feature">
          <h3>On-Device Latin OCR</h3>
          <p>Searchable PDF text layers and instant offline full-text search across your scans.</p>
        </div>
        <div class="feature">
          <h3>AES-256 PDF &amp; True Redaction</h3>
          <p>Reusable signatures, tiled watermarks, pixel+OCR redactions, and password-encrypted PDFs.</p>
        </div>
        <div class="feature">
          <h3>Offline-First + Drive Sync</h3>
          <p>Stores everything locally first with optional Google Drive (drive.file) sync across Android &amp; Web.</p>
        </div>
        <div class="feature">
          <h3>Accessibility &amp; Control</h3>
          <p>Text scaling, High Contrast WCAG AAA mode, Reduce Motion, storage cleanup, and zero telemetry.</p>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>How to install the Android APK</h2>
      <ol>
        <li>Tap <strong>Download APK</strong> above on your Android phone.</li>
        <li>Open the downloaded <code>${safeApkFileName}</code> from your browser downloads or notification shade.</li>
        <li>If prompted, allow <strong>Install unknown apps</strong> for your browser, then tap <strong>Install</strong>.</li>
      </ol>
      <p class="note">Source code &amp; automated releases: <a href="https://github.com/WilliamAxelC/CScanner" target="_blank" rel="noopener noreferrer">github.com/WilliamAxelC/CScanner</a></p>
    </section>

    <footer>
      CScanner &middot; Ad-free &amp; Open Source &middot; <a href="../">Launch Web App</a>
    </footer>
  </main>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
console.log(`Generated APK download page in ${outDir} (${apkFileName}, ${sizeMB} MB, sha256=${sha256})`);
