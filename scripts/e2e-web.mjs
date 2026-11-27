import { PDFDocument } from '@cantoo/pdf-lib';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { chromium } from 'playwright-core';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const chromePath =
  process.env.CHROMIUM_PATH ||
  '/home/agent/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function makeSyntheticDocJpeg(filePath) {
  const width = 420;
  const height = 560;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inPaper = x >= 45 && x <= 375 && y >= 55 && y <= 505;
      const isTextBar =
        inPaper &&
        x >= 80 &&
        x <= 320 &&
        ((y >= 110 && y <= 122) ||
          (y >= 150 && y <= 160) ||
          (y >= 190 && y <= 200) ||
          (y >= 240 && y <= 250));
      const v = isTextBar ? 25 : inPaper ? 245 : 28;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width, height }, 88);
  fs.writeFileSync(filePath, encoded.data);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
};

function startLocalServer(port) {
  const prefix = '/projects/cscanner';
  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    let rel = reqPath.startsWith(prefix)
      ? reqPath.slice(prefix.length)
      : reqPath;
    if (!rel || rel === '/') rel = '/index.html';
    if (rel.endsWith('/')) rel += 'index.html';

    let filePath = path.join(distDir, rel);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback matching nginx config
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const liveUrl = process.env.E2E_URL;
  let server = null;
  const port = 18945;
  const baseUrl = liveUrl
    ? liveUrl.replace(/\/+$/, '') + '/'
    : `http://127.0.0.1:${port}/projects/cscanner/`;

  if (!liveUrl) {
    assert(
      fs.existsSync(path.join(distDir, 'index.html')),
      'dist/index.html missing — run pnpm build:web:cuang first',
    );
    server = await startLocalServer(port);
  }

  const tmpDir = fs.mkdtempSync('/tmp/cscanner-e2e-');
  const sampleJpg = path.join(tmpDir, 'receipt.jpg');
  makeSyntheticDocJpeg(sampleJpg);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const pageErrors = [];
  const consoleErrors = [];
  const failedAppRequests = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 412, height: 892 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => {
      const url = req.url();
      if (!url.includes('static.cloudflareinsights.com')) {
        failedAppRequests.push(`${url} (${req.failure()?.errorText || 'failed'})`);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore Cloudflare edge beacon blocked by local DNS sinkhole
        if (
          text === 'Failed to load resource: net::ERR_NAME_NOT_RESOLVED' &&
          liveUrl
        ) {
          return;
        }
        consoleErrors.push(text);
      }
    });

    console.log('1. Opening ' + baseUrl);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('CScanner', { exact: true }).last().waitFor({ timeout: 20000 });
    await page.getByLabel('Download Android APK').last().waitFor({ timeout: 10000 });
    await page.getByLabel('Scan document').last().waitFor({ timeout: 10000 });

    console.log('2. Creating folder "Invoices"');
    await page.getByText('Folder', { exact: true }).last().click();
    await page
      .getByPlaceholder('e.g., Receipts, Tax 2026, Contracts')
      .fill('Invoices');
    await page.getByText('Create', { exact: true }).last().click();
    await page.getByText('Invoices', { exact: true }).last().waitFor({ timeout: 10000 });

    console.log('3. Importing synthetic document & confirming quad crop');
    await page.getByLabel('Scan document').last().click();
    const importBtn = page.getByText('Import Photos', { exact: true }).last();
    await importBtn.waitFor({ timeout: 15000 });
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      importBtn.click(),
    ]);
    await fileChooser.setFiles(sampleJpg);
    await page.getByText('Confirm Page', { exact: true }).last().waitFor({ timeout: 15000 });
    await page.getByText('Confirm Page', { exact: true }).last().click();
    await page.getByText('Save (1)', { exact: true }).last().waitFor({ timeout: 10000 });
    await page.getByText('Save (1)', { exact: true }).last().click();

    console.log('4. Verifying Document Viewer, folder & tag assignment');
    await page.getByText(/Page 1 of 1/).last().waitFor({ timeout: 20000 });
    await page.getByText('Unfiled', { exact: true }).last().click();
    await page.getByText('Invoices', { exact: true }).last().click();
    await page.getByText('Add tags', { exact: true }).last().click();
    await page.getByPlaceholder('invoice, warranty, 2026').fill('receipt, e2e');
    await page.getByText('Save', { exact: true }).last().click();
    await page.getByText('#receipt #e2e', { exact: true }).last().waitFor({ timeout: 10000 });

    console.log('5. Testing Filters, Signature Pad, Watermark, and Redact');
    await page.getByText('Filters & Crop', { exact: true }).last().click();
    await page.getByText('Crisp B&W', { exact: true }).last().click();
    await page.waitForTimeout(350);
    await page.getByText('Magic Color', { exact: true }).last().click();
    await page.waitForTimeout(350);

    await page.getByText('Annotate', { exact: true }).last().click();
    await page.getByText('New Signature', { exact: true }).last().click();
    const hint = page.getByText('Sign inside this white area', { exact: true }).last();
    await hint.waitFor({ timeout: 10000 });
    const box = await hint.boundingBox();
    assert(box, 'Signature pad bounding box missing');
    const sx = box.x + 20;
    const sy = box.y + 10;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 90, sy + 18, { steps: 6 });
    await page.mouse.move(sx + 150, sy - 8, { steps: 6 });
    await page.mouse.up();
    await page.getByText('Save Signature', { exact: true }).last().click();

    await page.getByText('Watermark', { exact: true }).last().click();
    await page.getByText('Apply', { exact: true }).last().click();
    await page.getByText('Redact Black', { exact: true }).last().click();
    await page.getByText('Done', { exact: true }).last().click();
    await page.getByText(/Page 1 of 1/).last().waitFor({ timeout: 15000 });

    console.log('6. Editing OCR text & testing full-text search');
    await page.getByText('OCR Text', { exact: true }).last().click();
    const ocrInput = page.locator('textarea:visible').last();
    await ocrInput.waitFor({ timeout: 10000 });
    await ocrInput.fill('Invoice Total 425000 Paid');
    await page.getByText('Save Edited OCR Text', { exact: true }).last().click();
    await page.getByText('Saved to Search Index!', { exact: true }).last().waitFor({ timeout: 10000 });

    // Back to doc -> back to home
    await page.goBack();
    await page.getByText(/Page 1 of 1/).last().waitFor({ timeout: 10000 });
    await page.goBack();
    const searchBox = page.getByPlaceholder('Search titles, #tags, or OCR text...').last();
    await searchBox.waitFor({ timeout: 10000 });
    await searchBox.fill('425000');
    await page.getByText(/^Scan /).last().waitFor({ timeout: 10000 });
    await page.getByLabel('Toggle layout').last().click();
    await page.getByText(/1 page/).last().waitFor({ timeout: 10000 });
    await searchBox.fill('');

    console.log('7. Exporting AES-256 encrypted PDF and verifying bytes');
    await page.getByText(/1 page/).last().click();
    await page.getByText(/Page 1 of 1/).last().waitFor({ timeout: 10000 });
    await page.getByText('Export', { exact: true }).last().click();
    await page.getByText('Password Protect (AES-256)', { exact: true }).last().waitFor({ timeout: 10000 });

    // Toggle Password Protect switch (2nd switch on Export screen)
    const switches = page.locator('input[type="checkbox"]:visible');
    await switches.nth(1).click();
    await page.getByPlaceholder('Enter PDF password').last().fill('testpass123');
    await page.getByPlaceholder('Confirm password').last().fill('testpass123');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 25000 }),
      page.getByText('Export & Share PDF', { exact: true }).last().click(),
    ]);
    const pdfPath = path.join(tmpDir, download.suggestedFilename() || 'out.pdf');
    await download.saveAs(pdfPath);
    const pdfBytes = fs.readFileSync(pdfPath);
    assert(pdfBytes.length > 500, `Exported PDF too small: ${pdfBytes.length}`);

    let unauthFailed = false;
    try {
      await PDFDocument.load(pdfBytes);
    } catch {
      unauthFailed = true;
    }
    assert(unauthFailed, 'Encrypted PDF opened without password!');
    const decrypted = await PDFDocument.load(pdfBytes, {
      password: 'testpass123',
    });
    assert(
      decrypted.getPageCount() === 1,
      `Expected 1 page in exported PDF, got ${decrypted.getPageCount()}`,
    );

    console.log('8. Verifying IndexedDB persistence after full page reload');
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('Invoices', { exact: true }).last().waitFor({ timeout: 15000 });
    await page.getByText(/^Scan /).last().waitFor({ timeout: 15000 });

    if (liveUrl || fs.existsSync(path.join(distDir, 'download/index.html'))) {
      console.log('9. Checking Android APK download landing page');
      await page.goto(`${baseUrl}download/`, { waitUntil: 'networkidle' });
      await page
        .getByRole('link', { name: /Download APK/ })
        .waitFor({ timeout: 10000 });
    }

    console.log('10. Checking production Settings, Accessibility, App Info, Report & Privacy screens');
    const vis = (loc) => loc.filter({ visible: true }).last();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await vis(page.getByLabel('Settings')).click();
    await vis(page.getByText('APPEARANCE & ACCESSIBILITY', { exact: true })).waitFor({ timeout: 15000 });

    // Accessibility screen
    await vis(page.getByLabel('Accessibility')).click();
    await vis(page.getByText('App Text Size', { exact: true })).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('Text size Large 115%')).click();
    await vis(page.getByRole('switch', { name: 'High Contrast Mode' })).click();
    await vis(page.getByRole('switch', { name: 'Reduce Motion' })).click();
    await vis(page.getByLabel('Back')).click();

    // App Info screen
    await vis(page.getByLabel('App Info')).click();
    await vis(page.getByText('dev.cuang.cscanner', { exact: true })).waitFor({ timeout: 10000 });
    await vis(page.getByText('Version 1.1.1 (build 3)', { exact: true })).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('View Diagnostics')).click();
    await vis(page.getByText(/Package ID: dev\.cuang\.cscanner/)).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('Open Source Licenses')).click();
    await vis(page.getByText(/Google ML Kit Document Scanner/)).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('Back')).click();

    // Report screen
    await vis(page.getByLabel('Report a Bug')).click();
    await vis(page.getByLabel('Open Pre-filled GitHub Issue')).click();
    await vis(page.getByText(/Please enter a short summary title/)).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('Feature Request')).click();
    await vis(page.getByLabel('Summary Title')).fill('Batch tag editor');
    await vis(page.getByLabel('Report Details')).fill('Allow editing tags across multiple scanned documents cleanly.');
    await vis(page.getByLabel('Show Payload Preview')).click();
    await vis(page.getByText(/## Feature Request/)).waitFor({ timeout: 10000 });
    await vis(page.getByLabel('Back')).click();

    // Privacy screen
    await vis(page.getByLabel('Privacy What Leaves Your Device')).click();
    await vis(page.getByText('EVERY NETWORK REQUEST THIS APP CAN MAKE', { exact: true })).waitFor({ timeout: 10000 });
    await vis(page.getByText(/cuang\.dev\/projects\/cscanner\/download\/version\.json/)).waitFor({ timeout: 10000 });

    assert(
      failedAppRequests.length === 0,
      `Failed app requests: ${failedAppRequests.join(' | ')}`,
    );
    assert(
      pageErrors.length === 0,
      `Page errors encountered: ${pageErrors.join(' | ')}`,
    );
    assert(
      consoleErrors.length === 0,
      `Console errors encountered: ${consoleErrors.join(' | ')}`,
    );

    console.log('ALL PLAYWRIGHT E2E CHECKS PASSED (0 errors)!');
  } finally {
    await browser.close();
    if (server) server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
