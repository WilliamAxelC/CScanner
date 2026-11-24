import { Linking } from 'react-native';
import { create } from 'zustand';
import {
  getNativeUpdater,
  type UpdateNativeApi,
} from '../../../modules/cscanner-mlkit/src';
import type { AppSettings } from '../../types/models';
import { recordError } from '../diagnostics/errorLog';
import {
  CSCANNER_PACKAGE,
  getInstalledAppInfo,
  useUpdateStore,
  type UpdateManifest,
} from './updateChecker';
import {
  getUpdateFs,
  type UpdateDownloadTask,
  type UpdateFsApi,
} from './updateFs';

type PersistPatchFn = (patch: Partial<AppSettings>) => Promise<void> | void;

let persistPatch: PersistPatchFn | null = null;
let nativeOverride: UpdateNativeApi | null | undefined;
let fsOverride: UpdateFsApi | null | undefined;
let activeDownload: UpdateDownloadTask | null = null;

export function configureAppUpdatePersistence(fn: PersistPatchFn | null): void {
  persistPatch = fn;
}

function resolveNative(): UpdateNativeApi | null {
  return nativeOverride !== undefined ? nativeOverride : getNativeUpdater();
}

function resolveFs(): UpdateFsApi | null {
  return fsOverride !== undefined ? fsOverride : getUpdateFs();
}

export type UpdateStatus =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'needs-permission'
  | 'installing'
  | 'error';

interface AppUpdateState {
  status: UpdateStatus;
  progress: number;
  error: string | null;
  fileUri: string | null;
  sheet: UpdateManifest | null;
  openSheet: (manifest: UpdateManifest) => void;
  closeSheet: () => void;
  start: (manifest: UpdateManifest) => Promise<void>;
  install: () => void;
  openPermissionSettings: () => void;
  cancel: () => Promise<void>;
  reset: () => void;
}

class UpdateError extends Error {}

export function updatesDir(): string {
  const fs = resolveFs();
  return `${fs?.cacheDirectory ?? ''}updates/`;
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: 'idle',
  progress: 0,
  error: null,
  fileUri: null,
  sheet: null,

  openSheet: (manifest) =>
    set((s) => ({
      sheet: manifest,
      ...(s.status === 'error' ? { status: 'idle' as const, error: null } : {}),
    })),

  closeSheet: () =>
    set((s) => ({
      sheet: null,
      ...(s.status === 'error' ? { status: 'idle' as const, error: null } : {}),
    })),

  start: async (manifest) => {
    if (get().status === 'downloading' || get().status === 'verifying') return;
    const apk = manifest.apk;
    const native = resolveNative();
    const fs = resolveFs();
    if (!apk || !native || !fs) {
      await Linking.openURL(manifest.url);
      return;
    }

    const installed = getInstalledAppInfo();
    if (manifest.versionCode <= installed.versionCode) {
      set({ status: 'error', error: 'You already have this version.' });
      return;
    }

    const dir = updatesDir();
    const fileUri = `${dir}cscanner-${manifest.version}-${manifest.versionCode}.apk`;
    set({ status: 'downloading', progress: 0, error: null, fileUri });

    try {
      await fs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
      const existing = await fs.getInfoAsync(fileUri);
      let haveFile = existing.exists && existing.size === apk.sizeBytes;
      if (haveFile && (await native.sha256File(fileUri)) !== apk.sha256) {
        haveFile = false;
      }

      if (!haveFile) {
        await fs.deleteAsync(fileUri, { idempotent: true });
        activeDownload = fs.createDownloadResumable(apk.url, fileUri, {}, (p) => {
          const total =
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesExpectedToWrite
              : apk.sizeBytes;
          set({ progress: Math.min(1, p.totalBytesWritten / total) });
        });
        const result = await activeDownload.downloadAsync();
        activeDownload = null;
        if (!result) return; // cancelled
        if (result.status !== 200) {
          await fs.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
          throw new UpdateError(
            `Download failed (HTTP ${result.status}). Please try again.`,
          );
        }
      }

      set({ status: 'verifying', progress: 1 });
      const sha = await native.sha256File(fileUri);
      if (sha !== apk.sha256) {
        await fs.deleteAsync(fileUri, { idempotent: true });
        throw new UpdateError(
          'Downloaded APK did not match the published SHA-256 checksum, so it was deleted. Nothing was installed.',
        );
      }

      const info = native.inspectApk(fileUri);
      if (
        !info ||
        info.packageName !== CSCANNER_PACKAGE ||
        info.versionCode !== manifest.versionCode
      ) {
        await fs.deleteAsync(fileUri, { idempotent: true });
        throw new UpdateError(
          'Downloaded APK does not match CScanner or the expected build number, so it was deleted.',
        );
      }

      get().install();
    } catch (err) {
      activeDownload = null;
      if (!(err instanceof UpdateError)) {
        recordError('AppUpdate', err);
      }
      set({
        status: 'error',
        error:
          err instanceof UpdateError
            ? err.message
            : "Couldn't download the update. Check your connection and try again.",
      });
    }
  },

  install: () => {
    const { fileUri } = get();
    const native = resolveNative();
    if (!native || !fileUri) return;

    if (!native.canInstallPackages()) {
      const code = Number(/-(\d+)\.apk$/.exec(fileUri)?.[1] ?? 0);
      void persistPatch?.({ pendingUpdateVersionCode: code || 0 });
      set({ status: 'needs-permission', error: null });
      return;
    }

    try {
      void persistPatch?.({ pendingUpdateVersionCode: 0 });
      native.installApk(fileUri);
      set({ status: 'installing', error: null });
    } catch (err) {
      recordError('AppUpdateInstall', err);
      set({
        status: 'error',
        error: "Android's package installer could not be opened.",
      });
    }
  },

  openPermissionSettings: () => {
    try {
      resolveNative()?.openInstallPermissionSettings();
    } catch (err) {
      recordError('AppUpdatePerm', err);
    }
  },

  cancel: async () => {
    const current = activeDownload;
    activeDownload = null;
    try {
      await current?.pauseAsync();
    } catch {
      // already finished or aborted
    }
    const { fileUri } = get();
    const fs = resolveFs();
    if (fileUri && fs) {
      await fs.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    }
    set({ status: 'idle', progress: 0, error: null, fileUri: null });
  },

  reset: () => set({ status: 'idle', progress: 0, error: null }),
}));

export async function resumePendingUpdate(
  pendingVersionCode?: number,
): Promise<boolean> {
  if (!pendingVersionCode || pendingVersionCode <= 0) return false;
  const latest = useUpdateStore.getState().latest;
  const installed = getInstalledAppInfo();
  if (
    !latest ||
    latest.versionCode !== pendingVersionCode ||
    latest.versionCode <= installed.versionCode
  ) {
    void persistPatch?.({ pendingUpdateVersionCode: 0 });
    return false;
  }
  const native = resolveNative();
  if (!native?.canInstallPackages()) return false;

  const store = useAppUpdateStore.getState();
  store.openSheet(latest);
  await store.start(latest);
  return true;
}

export async function cleanUpInstalledUpdates(): Promise<void> {
  const fs = resolveFs();
  if (!fs) return;
  const installed = getInstalledAppInfo().versionCode;
  try {
    const dir = updatesDir();
    for (const name of await fs.readDirectoryAsync(dir)) {
      const code = Number(/-(\d+)\.apk$/.exec(name)?.[1] ?? 0);
      if (!code || code <= installed) {
        await fs.deleteAsync(`${dir}${name}`, { idempotent: true });
      }
    }
  } catch {
    // updates cache folder not created yet
  }
}

export function __setUpdateNativeForTests(value: UpdateNativeApi | null | undefined): void {
  nativeOverride = value;
}

export function __setUpdateFsForTests(value: UpdateFsApi | null | undefined): void {
  fsOverride = value;
}
