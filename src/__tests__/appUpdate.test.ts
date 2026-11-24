import { beforeEach, describe, expect, it, vi } from 'vitest';

const { linkingOpenUrlMock, platformState } = vi.hoisted(() => ({
  linkingOpenUrlMock: vi.fn(async () => true),
  platformState: { OS: 'android' as 'android' | 'web', Version: 35 },
}));

vi.mock('expo', () => ({
  requireOptionalNativeModule: vi.fn(() => null),
}));

vi.mock('react-native', () => ({
  Platform: platformState,
  Linking: { openURL: linkingOpenUrlMock },
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
        package: 'com.cscanner.app',
      },
    },
  },
}));

import type { UpdateNativeApi } from '../../modules/cscanner-mlkit/src';
import {
  __setUpdateFsForTests,
  __setUpdateNativeForTests,
  cleanUpInstalledUpdates,
  configureAppUpdatePersistence,
  resumePendingUpdate,
  useAppUpdateStore,
} from '../services/updates/appUpdate';
import type { UpdateFsApi } from '../services/updates/updateFs';
import {
  configureUpdatePersistence,
  DOWNLOAD_PAGE_URL,
  parseApk,
  parseManifest,
  selectShowUpdateBanner,
  useUpdateStore,
  type UpdateManifest,
} from '../services/updates/updateChecker';
import { DEFAULT_APP_SETTINGS } from '../types/models';

const VALID_SHA = 'a'.repeat(64);
const MANIFEST: UpdateManifest = {
  version: '1.2.0',
  versionCode: 3,
  url: DOWNLOAD_PAGE_URL,
  date: '2026-11-24',
  notes: ['Faster scan pipeline'],
  apk: {
    url: 'https://cuang.dev/projects/cscanner/download/cscanner-1.2.0.apk',
    sha256: VALID_SHA,
    sizeBytes: 22_000_000,
  },
};

function createMockNative(overrides: Partial<UpdateNativeApi> = {}): UpdateNativeApi {
  return {
    sha256File: vi.fn(async () => VALID_SHA),
    canInstallPackages: vi.fn(() => true),
    openInstallPermissionSettings: vi.fn(() => true),
    inspectApk: vi.fn(() => ({
      packageName: 'com.cscanner.app',
      versionCode: 3,
      versionName: '1.2.0',
    })),
    installApk: vi.fn(() => true),
    ...overrides,
  };
}

function createMockFs(overrides: Partial<UpdateFsApi> = {}): UpdateFsApi {
  return {
    cacheDirectory: 'file:///data/user/0/com.cscanner.app/cache/',
    makeDirectoryAsync: vi.fn(async () => undefined),
    getInfoAsync: vi.fn(async () => ({ exists: false })),
    deleteAsync: vi.fn(async () => undefined),
    readDirectoryAsync: vi.fn(async () => []),
    createDownloadResumable: vi.fn((_url, _uri, _opts, cb) => ({
      downloadAsync: vi.fn(async () => {
        cb({ totalBytesWritten: 11_000_000, totalBytesExpectedToWrite: 22_000_000 });
        cb({ totalBytesWritten: 22_000_000, totalBytesExpectedToWrite: 22_000_000 });
        return { status: 200 };
      }),
      pauseAsync: vi.fn(async () => undefined),
    })),
    ...overrides,
  };
}

describe('Auto-Update Checker & In-App APK Installer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.OS = 'android';
    configureUpdatePersistence(null);
    configureAppUpdatePersistence(null);
    __setUpdateNativeForTests(undefined);
    __setUpdateFsForTests(undefined);
    useUpdateStore.setState({
      latest: null,
      checkedAt: null,
      checking: false,
      enabled: true,
      dismissedVersionCode: 0,
      lastCheckFailed: false,
      lastError: null,
    });
    useAppUpdateStore.setState({
      status: 'idle',
      progress: 0,
      error: null,
      fileUri: null,
      sheet: null,
    });
  });

  it('validates update manifests & strictly enforces cuang.dev origin and SHA-256 format', () => {
    expect(parseManifest(MANIFEST)?.apk?.sha256).toBe(VALID_SHA);

    // Flat/transitional manifest fallback still validates cuang.dev prefix & SHA
    const flat = parseManifest({
      version: '1.2.0',
      versionCode: 3,
      downloadUrl: '/projects/cscanner/download/cscanner-1.2.0.apk',
      sha256: VALID_SHA,
      sizeBytes: 20_000_000,
      releaseNotes: ['Bug fixes'],
    });
    expect(flat?.apk?.url).toBe('https://cuang.dev/projects/cscanner/download/cscanner-1.2.0.apk');
    expect(flat?.notes).toEqual(['Bug fixes']);

    // Unsafe APK URLs, query strings, wrong checksums, or oversized payloads are rejected
    expect(parseApk({ url: 'https://evil.example/a.apk', sha256: VALID_SHA, sizeBytes: 1000 })).toBeUndefined();
    expect(parseApk({ url: 'https://cuang.dev/projects/cscanner/a.apk?foo=1', sha256: VALID_SHA, sizeBytes: 1000 })).toBeUndefined();
    expect(parseApk({ url: 'https://cuang.dev/projects/cscanner/a.apk', sha256: 'short', sizeBytes: 1000 })).toBeUndefined();
    expect(parseApk({ url: 'https://cuang.dev/projects/cscanner/a.apk', sha256: VALID_SHA, sizeBytes: 500 * 1024 * 1024 })).toBeUndefined();
  });

  it('rate-limits background checks to once per local day, honors force, and handles banner dismissal', async () => {
    const persisted: Record<string, unknown> = {};
    configureUpdatePersistence((patch) => {
      Object.assign(persisted, patch);
    });

    useUpdateStore.getState().hydrate({ ...DEFAULT_APP_SETTINGS, autoCheckUpdates: true });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    }));

    const day1Morning = new Date(2026, 10, 24, 9, 0).getTime();
    const day1Evening = new Date(2026, 10, 24, 21, 0).getTime();
    const day2Morning = new Date(2026, 10, 25, 8, 0).getTime();

    await useUpdateStore.getState().check({ now: day1Morning, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(persisted.updateLastCheckedAt).toBe(day1Morning);

    // Same day auto check is skipped
    await useUpdateStore.getState().check({ now: day1Evening, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Force check bypasses daily rate limit
    await useUpdateStore.getState().check({ force: true, now: day1Evening, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Banner visible until dismissed for this versionCode
    expect(selectShowUpdateBanner(useUpdateStore.getState())).toBe(true);
    useUpdateStore.getState().dismiss();
    expect(selectShowUpdateBanner(useUpdateStore.getState())).toBe(false);
    expect(persisted.updateDismissedVersionCode).toBe(3);

    // Next day check triggers again
    await useUpdateStore.getState().check({ now: day2Morning, fetchImpl: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Error handling on forced check
    await useUpdateStore.getState().check({
      force: true,
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    expect(useUpdateStore.getState().lastCheckFailed).toBe(true);
  });

  it('skips automatic network checks on Web PWA unless manually forced', async () => {
    platformState.OS = 'web';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    }));
    const prevFetch = globalThis.fetch;
    vi.stubGlobal('fetch', fetchMock);
    try {
      await useUpdateStore.getState().check();
      expect(fetchMock).not.toHaveBeenCalled();

      await useUpdateStore.getState().check({ force: true });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal('fetch', prevFetch);
    }
  });

  it('downloads, verifies SHA-256 & APK package info, and opens Android installer', async () => {
    const native = createMockNative();
    const fs = createMockFs();
    __setUpdateNativeForTests(native);
    __setUpdateFsForTests(fs);

    await useAppUpdateStore.getState().start(MANIFEST);

    expect(native.sha256File).toHaveBeenCalledTimes(1);
    expect(native.inspectApk).toHaveBeenCalledTimes(1);
    expect(native.installApk).toHaveBeenCalledWith(
      'file:///data/user/0/com.cscanner.app/cache/updates/cscanner-1.2.0-3.apk',
    );
    expect(useAppUpdateStore.getState().status).toBe('installing');
    expect(useAppUpdateStore.getState().progress).toBe(1);
  });

  it('reuses cached APK without re-downloading when size and SHA-256 already match', async () => {
    const native = createMockNative();
    const fs = createMockFs({
      getInfoAsync: vi.fn(async () => ({ exists: true, size: 22_000_000 })),
    });
    __setUpdateNativeForTests(native);
    __setUpdateFsForTests(fs);

    await useAppUpdateStore.getState().start(MANIFEST);

    expect(fs.createDownloadResumable).not.toHaveBeenCalled();
    expect(native.installApk).toHaveBeenCalledTimes(1);
    expect(useAppUpdateStore.getState().status).toBe('installing');
  });

  it('deletes downloaded file and aborts on SHA-256 mismatch or wrong package/versionCode', async () => {
    const badShaNative = createMockNative({
      sha256File: vi.fn(async () => 'b'.repeat(64)),
    });
    const fs = createMockFs();
    __setUpdateNativeForTests(badShaNative);
    __setUpdateFsForTests(fs);

    await useAppUpdateStore.getState().start(MANIFEST);
    expect(useAppUpdateStore.getState().status).toBe('error');
    expect(useAppUpdateStore.getState().error).toMatch(/SHA-256 checksum/);
    expect(fs.deleteAsync).toHaveBeenCalled();
    expect(badShaNative.installApk).not.toHaveBeenCalled();

    useAppUpdateStore.getState().reset();
    const spoofedApkNative = createMockNative({
      inspectApk: vi.fn(() => ({
        packageName: 'com.evil.spoof',
        versionCode: 3,
        versionName: '1.2.0',
      })),
    });
    __setUpdateNativeForTests(spoofedApkNative);
    await useAppUpdateStore.getState().start(MANIFEST);
    expect(useAppUpdateStore.getState().status).toBe('error');
    expect(useAppUpdateStore.getState().error).toMatch(/does not match CScanner/);
    expect(spoofedApkNative.installApk).not.toHaveBeenCalled();
  });

  it('handles missing install permission, persists pending build, and resumes after permission granted', async () => {
    const persisted: Record<string, unknown> = {};
    configureAppUpdatePersistence((patch) => {
      Object.assign(persisted, patch);
    });

    const native = createMockNative({
      canInstallPackages: vi.fn(() => false),
    });
    const fs = createMockFs();
    __setUpdateNativeForTests(native);
    __setUpdateFsForTests(fs);

    useUpdateStore.setState({ latest: MANIFEST });
    await useAppUpdateStore.getState().start(MANIFEST);

    expect(useAppUpdateStore.getState().status).toBe('needs-permission');
    expect(persisted.pendingUpdateVersionCode).toBe(3);

    useAppUpdateStore.getState().openPermissionSettings();
    expect(native.openInstallPermissionSettings).toHaveBeenCalledTimes(1);

    // Simulate process restart after user toggles "Allow from this source"
    (native.canInstallPackages as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: true,
      size: 22_000_000,
    });
    useAppUpdateStore.setState({ status: 'idle', sheet: null, fileUri: null });

    const resumed = await resumePendingUpdate(3);
    expect(resumed).toBe(true);
    expect(native.installApk).toHaveBeenCalledTimes(1);
    expect(persisted.pendingUpdateVersionCode).toBe(0);
    expect(useAppUpdateStore.getState().status).toBe('installing');
  });

  it('handles HTTP download failures, Web/browser fallback, outdated version, and old APK cleanup', async () => {
    const native = createMockNative();
    const fs = createMockFs({
      readDirectoryAsync: vi.fn(async () => [
        'cscanner-1.0.0-1.apk',
        'cscanner-1.1.0-2.apk',
        'cscanner-1.2.0-3.apk',
      ]),
      createDownloadResumable: vi.fn(() => ({
        downloadAsync: vi.fn(async () => ({ status: 404 })),
        pauseAsync: vi.fn(async () => undefined),
      })),
    });
    __setUpdateNativeForTests(native);
    __setUpdateFsForTests(fs);

    await useAppUpdateStore.getState().start(MANIFEST);
    expect(useAppUpdateStore.getState().status).toBe('error');
    expect(useAppUpdateStore.getState().error).toMatch(/HTTP 404/);

    useAppUpdateStore.getState().reset();
    await useAppUpdateStore.getState().start({ ...MANIFEST, versionCode: 2 });
    expect(useAppUpdateStore.getState().status).toBe('error');
    expect(useAppUpdateStore.getState().error).toMatch(/already have/);

    // Browser fallback when native module unavailable
    __setUpdateNativeForTests(null);
    await useAppUpdateStore.getState().start(MANIFEST);
    expect(linkingOpenUrlMock).toHaveBeenCalledWith(MANIFEST.url);

    // Clean up APKs <= installed versionCode (2)
    (fs.deleteAsync as ReturnType<typeof vi.fn>).mockClear();
    await cleanUpInstalledUpdates();
    expect(fs.deleteAsync).toHaveBeenCalledWith(
      'file:///data/user/0/com.cscanner.app/cache/updates/cscanner-1.0.0-1.apk',
      { idempotent: true },
    );
    expect(fs.deleteAsync).toHaveBeenCalledWith(
      'file:///data/user/0/com.cscanner.app/cache/updates/cscanner-1.1.0-2.apk',
      { idempotent: true },
    );
    expect(fs.deleteAsync).not.toHaveBeenCalledWith(
      'file:///data/user/0/com.cscanner.app/cache/updates/cscanner-1.2.0-3.apk',
      { idempotent: true },
    );
  });
});
