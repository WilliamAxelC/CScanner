import { beforeEach, describe, expect, it, vi } from 'vitest';

// Installed version for these tests (the app reads app.json first), so a release bump doesn't change them.
vi.mock('../../app.json', () => ({
  default: {
    expo: {
      name: 'CScanner',
      version: '1.1.0',
      android: { versionCode: 2, package: 'dev.cuang.cscanner' },
    },
  },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 35 },
  Share: {
    dismissedAction: 'dismissedAction',
    share: vi.fn(async () => ({ action: 'sharedAction' })),
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      name: 'CScanner',
      version: '1.1.0',
      android: {
        versionCode: 2,
        package: 'dev.cuang.cscanner',
      },
    },
  },
}));

import {
  buildDiagnosticsReport,
  clearErrorLog,
  formatErrorLog,
  getErrorLog,
  recordError,
  redactSensitiveText,
} from '../services/diagnostics/errorLog';
import {
  buildGitHubIssueUrl,
  buildReportMarkdown,
  validateReport,
} from '../services/feedback/reportBuilder';
import { readFileSync } from 'node:fs';

import {
  checkForUpdates,
  compareSemver,
  CSCANNER_PACKAGE,
  getInstalledAppInfo,
} from '../services/updates/updateChecker';
import { DEFAULT_APP_SETTINGS } from '../types/models';

describe('Diagnostics, Updates & Feedback Services', () => {
  beforeEach(() => {
    clearErrorLog();
  });

  it('redacts tokens, emails, digit runs, and filesystem paths in error logs', () => {
    const cleaned = redactSensitiveText(
      'Auth Bearer ya29.superSecretXYZ failed for bob@acme.org at /data/user/0/dev.cuang.cscanner/files/secret.jpg card 4532015112830366',
    );
    expect(cleaned).not.toContain('ya29.superSecretXYZ');
    expect(cleaned).not.toContain('bob@acme.org');
    expect(cleaned).not.toContain('4532015112830366');
    expect(cleaned).not.toContain('/data/user/0');

    recordError('DriveSync', 'Request Bearer ya29.abc failed for carol@test.io');
    expect(getErrorLog()).toHaveLength(1);
    const formatted = formatErrorLog();
    expect(formatted).toContain('(DriveSync)');
    expect(formatted).not.toContain('ya29.abc');
    expect(formatted).not.toContain('carol@test.io');

    clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
    expect(formatErrorLog()).toContain('No recent errors');
  });

  it('builds sanitized diagnostics report without exposing scan titles or tokens', () => {
    recordError('OCR', 'Tesseract fallback failed at /home/user/docs/private.png');
    const report = buildDiagnosticsReport({
      settings: {
        ...DEFAULT_APP_SETTINGS,
        highContrast: true,
        fontScale: 1.15,
        googleEmail: 'private-user@gmail.com',
      },
      stats: {
        docCount: 3,
        pageCount: 7,
        signatureCount: 1,
        pendingSyncCount: 2,
        imageBytes: 123456,
      },
    });

    expect(report).toContain('App: CScanner v1.1.0 (build 2)');
    expect(report).toContain('Package ID: dev.cuang.cscanner');
    expect(report).toContain('Font Scale: 115%');
    expect(report).toContain('Local Store: 3 docs, 7 pages, 1 signatures, 2 pending sync');
    expect(report).not.toContain('private-user@gmail.com');
    expect(report).not.toContain('/home/user/docs');
  });

  it('compares semver strings and checks remote updates cleanly via fetch mock', async () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareSemver('v1.1.0', '1.1.0')).toBe(0);
    expect(compareSemver('1.0.9', '1.1.0')).toBeLessThan(0);

    const installed = getInstalledAppInfo();
    expect(installed.version).toBe('1.1.0');
    expect(installed.versionCode).toBe(2);

    const upToDate = await checkForUpdates(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'CScanner',
        version: '1.1.0',
        versionCode: 2,
        packageId: 'dev.cuang.cscanner',
      }),
    }));
    expect(upToDate.status).toBe('up-to-date');

    const newer = await checkForUpdates(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'CScanner',
        version: '1.2.0',
        versionCode: 3,
        packageId: 'dev.cuang.cscanner',
        sizeLabel: '28.4 MB',
        sha256: 'a'.repeat(64),
        releaseNotes: ['New scanner filters'],
      }),
    }));
    expect(newer.status).toBe('update-available');
    expect(newer.remote?.sizeLabel).toBe('28.4 MB');
    expect(newer.remote?.sha256).toBe('a'.repeat(64));

    const netErr = await checkForUpdates(async () => {
      throw new Error('Network unreachable');
    });
    expect(netErr.status).toBe('error');
    expect(netErr.errorMessage).toContain('Network unreachable');
  });

  it('validates bug/feature reports and builds scrubbed GitHub Issue URLs', () => {
    expect(
      validateReport({ kind: 'bug', title: 'abc', description: 'too short' }),
    ).toContain('at least 4');
    expect(
      validateReport({
        kind: 'bug',
        title: 'Crash on export',
        description: 'short',
      }),
    ).toContain('at least 12');
    expect(
      validateReport({
        kind: 'feature',
        title: 'Batch tag editing',
        description: 'Allow adding a tag to multiple selected scans in library.',
      }),
    ).toBeNull();

    const md = buildReportMarkdown({
      kind: 'bug',
      title: 'Sync fails on flaky wifi',
      description: 'Token Bearer ya29.secretToken leaked at /home/alice/scan.jpg',
      diagnostics: 'App: CScanner v1.1.0 (build 2)',
    });
    expect(md).toContain('## Bug Report');
    expect(md).not.toContain('ya29.secretToken');
    expect(md).not.toContain('/home/alice');

    const url = buildGitHubIssueUrl({
      kind: 'feature',
      title: 'Keyboard shortcuts',
      description: 'Support Ctrl+K quick search on web PWA.',
    });
    expect(url.startsWith('https://github.com/WilliamAxelC/CScanner/issues/new?')).toBe(
      true,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('labels')).toBe('enhancement');
    expect(parsed.searchParams.get('title')).toBe('[Feature] Keyboard shortcuts');
  });
});

describe('package id', () => {
  it('the updater only installs APKs with the package id the app is built with', () => {
    const appConfig = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
    expect(CSCANNER_PACKAGE).toBe(appConfig.expo.android.package);
    expect(CSCANNER_PACKAGE).toBe('dev.cuang.cscanner');
  });
});
