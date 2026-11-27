import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { create } from 'zustand';
import appJson from '../../../app.json';
import type { AppSettings } from '../../types/models';
import { safeJsonParse, sanitizeErrorMessage } from '../../utils/security';

export const ALLOWED_LINK_PREFIX = 'https://cuang.dev/';
export const CSCANNER_PACKAGE = 'dev.cuang.cscanner';
export const VERSION_CHECK_URL =
  'https://cuang.dev/projects/cscanner/download/version.json';
export const DOWNLOAD_PAGE_URL =
  'https://cuang.dev/projects/cscanner/download/';
export const GITHUB_REPO_URL = 'https://github.com/WilliamAxelC/CScanner';

export interface AppVersion {
  version: string;
  versionCode: number;
}

export interface InstalledAppInfo extends AppVersion {
  name: string;
  packageId: string;
}

export interface UpdateApk {
  url: string;
  sha256: string;
  sizeBytes: number;
}

export interface UpdateManifest extends AppVersion {
  url: string;
  date?: string;
  notes?: string[];
  apk?: UpdateApk;
}

export interface UpdateCache {
  checkedAt: number;
  latest: UpdateManifest | null;
}

export interface RemoteVersionInfo {
  name: string;
  version: string;
  versionCode?: number;
  packageId: string;
  sizeLabel?: string;
  sha256?: string;
  builtAt?: string;
  downloadUrl?: string;
  releaseNotes?: string[];
}

export interface UpdateCheckResult {
  status: 'up-to-date' | 'update-available' | 'error';
  installed: InstalledAppInfo;
  remote?: RemoteVersionInfo;
  errorMessage?: string;
  checkedAt: number;
}

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

type PersistPatchFn = (patch: Partial<AppSettings>) => Promise<void> | void;

let persistPatch: PersistPatchFn | null = null;

export function configureUpdatePersistence(fn: PersistPatchFn | null): void {
  persistPatch = fn;
}

export function getInstalledAppInfo(): InstalledAppInfo {
  const cfg = Constants.expoConfig;
  const androidCfg = appJson.expo.android as {
    versionCode?: number;
    package?: string;
  };
  return {
    name: appJson.expo.name ?? cfg?.name ?? 'CScanner',
    version: appJson.expo.version ?? cfg?.version ?? '1.1.0',
    versionCode: androidCfg?.versionCode ?? cfg?.android?.versionCode ?? 2,
    packageId:
      androidCfg?.package ?? cfg?.android?.package ?? CSCANNER_PACKAGE,
  };
}

/**
 * Compares two semver strings (e.g. "1.1.0" vs "1.0.0"). Returns >0 if a > b, 0 if equal, <0 if a < b.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .slice(0, 3)
      .map((n) => {
        const parsed = parseInt(n, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function parseApk(value: unknown): UpdateApk | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  const url = rawUrl.startsWith('/projects/cscanner/')
    ? `https://cuang.dev${rawUrl}`
    : rawUrl;
  const sha256 =
    typeof raw.sha256 === 'string' ? raw.sha256.trim().toLowerCase() : '';
  const sizeBytes = Number(raw.sizeBytes);
  if (
    !url.startsWith(ALLOWED_LINK_PREFIX) ||
    !/\.apk$/i.test(url) ||
    /[\s?#]/.test(url)
  ) {
    return undefined;
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  if (
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > 300 * 1024 * 1024
  ) {
    return undefined;
  }
  return { url, sha256, sizeBytes };
}

export function parseManifest(body: unknown): UpdateManifest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  const versionCode = Number(raw.versionCode);
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (
    !/^\d+(\.\d+){0,3}$/.test(version) ||
    !Number.isInteger(versionCode) ||
    versionCode <= 0
  ) {
    return null;
  }
  const safeUrl = url.startsWith(ALLOWED_LINK_PREFIX)
    ? url
    : DOWNLOAD_PAGE_URL;
  const rawNotes = Array.isArray(raw.notes)
    ? raw.notes
    : Array.isArray(raw.releaseNotes)
      ? raw.releaseNotes
      : null;
  const notes = rawNotes
    ? rawNotes
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .map((n) => n.trim().slice(0, 160))
        .slice(0, 6)
    : undefined;
  const date =
    typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      ? raw.date
      : undefined;

  const apk =
    parseApk(raw.apk) ??
    parseApk({
      url: raw.downloadUrl,
      sha256: raw.sha256,
      sizeBytes: raw.sizeBytes,
    });

  return { version, versionCode, url: safeUrl, date, notes, apk };
}

export function isNewer(
  latest: AppVersion | null | undefined,
  installed: AppVersion,
): boolean {
  return Boolean(latest && latest.versionCode > installed.versionCode);
}

const sameLocalDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();

interface UpdateState {
  installed: InstalledAppInfo;
  latest: UpdateManifest | null;
  checkedAt: number | null;
  checking: boolean;
  enabled: boolean;
  dismissedVersionCode: number;
  lastCheckFailed: boolean;
  lastError: string | null;
  hydrate: (settings: AppSettings) => void;
  check: (options?: {
    force?: boolean;
    now?: number;
    fetchImpl?: FetchLike;
  }) => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  installed: getInstalledAppInfo(),
  latest: null,
  checkedAt: null,
  checking: false,
  enabled: true,
  dismissedVersionCode: 0,
  lastCheckFailed: false,
  lastError: null,

  hydrate: (settings) => {
    const parsedCached = settings.updateCachedManifestJson
      ? parseManifest(safeJsonParse<unknown>(settings.updateCachedManifestJson, null))
      : null;
    set({
      installed: getInstalledAppInfo(),
      enabled: settings.autoCheckUpdates !== false,
      checkedAt:
        typeof settings.updateLastCheckedAt === 'number'
          ? settings.updateLastCheckedAt
          : null,
      dismissedVersionCode:
        typeof settings.updateDismissedVersionCode === 'number'
          ? settings.updateDismissedVersionCode
          : 0,
      latest: parsedCached,
    });
  },

  check: async (options = {}) => {
    if (get().checking) return;
    const now = options.now ?? Date.now();
    if (!options.force) {
      if (!get().enabled) return;
      if (Platform.OS !== 'android' && !options.fetchImpl) return;
      const last = get().checkedAt;
      if (last !== null && sameLocalDay(last, now)) return;
    }

    set({ checking: true, ...(options.force ? { lastCheckFailed: false, lastError: null } : {}) });

    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const doFetch =
        options.fetchImpl ??
        ((url: string, init?: RequestInit) =>
          fetch(url, { cache: 'no-store', ...init } as RequestInit));
      const res = await doFetch(VERSION_CHECK_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status ?? 'error'}`);
      }
      const parsed = parseManifest(await res.json());
      if (!parsed) {
        throw new Error('Invalid version manifest');
      }
      set({
        checking: false,
        latest: parsed,
        checkedAt: now,
        lastCheckFailed: false,
        lastError: null,
      });
      void persistPatch?.({
        updateLastCheckedAt: now,
        updateCachedManifestJson: JSON.stringify(parsed),
      });
    } catch (err) {
      set({
        checking: false,
        ...(options.force
          ? {
              lastCheckFailed: true,
              lastError: sanitizeErrorMessage(err, 120),
            }
          : {}),
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  },

  setEnabled: (enabled) => {
    set({ enabled });
    void persistPatch?.({ autoCheckUpdates: enabled });
  },

  dismiss: () => {
    const code = get().latest?.versionCode ?? 0;
    set({ dismissedVersionCode: code });
    void persistPatch?.({ updateDismissedVersionCode: code });
  },
}));

export function selectShowUpdateBanner(
  state: Pick<UpdateState, 'latest' | 'installed' | 'dismissedVersionCode'>,
): boolean {
  return (
    isNewer(state.latest, state.installed) &&
    (state.latest?.versionCode ?? 0) > state.dismissedVersionCode
  );
}

/** Direct single-shot manifest check helper (used by diagnostics & unit tests). */
export async function checkForUpdates(
  fetchImpl?: FetchLike,
): Promise<UpdateCheckResult> {
  const installed = getInstalledAppInfo();
  const checkedAt = Date.now();
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;

  try {
    const doFetch = fetchImpl ?? (fetch as unknown as FetchLike);
    const res = await doFetch(VERSION_CHECK_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status ?? 'error'}`);
    }
    const raw = (await res.json()) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'string') {
      throw new Error('Invalid version manifest');
    }

    const remoteVersion = raw.version.trim().slice(0, 32);
    const remoteCode =
      typeof raw.versionCode === 'number' && Number.isFinite(raw.versionCode)
        ? raw.versionCode
        : undefined;

    const shaFromNested =
      raw.apk && typeof raw.apk === 'object'
        ? (raw.apk as { sha256?: unknown }).sha256
        : undefined;
    const rawSha =
      typeof raw.sha256 === 'string'
        ? raw.sha256
        : typeof shaFromNested === 'string'
          ? shaFromNested
          : undefined;

    const remote: RemoteVersionInfo = {
      name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : 'CScanner',
      version: remoteVersion,
      versionCode: remoteCode,
      packageId:
        typeof raw.packageId === 'string'
          ? raw.packageId.slice(0, 80)
          : installed.packageId,
      sizeLabel:
        typeof raw.sizeLabel === 'string' ? raw.sizeLabel.slice(0, 32) : undefined,
      sha256:
        typeof rawSha === 'string' && /^[a-f0-9]{64}$/i.test(rawSha)
          ? rawSha.toLowerCase()
          : undefined,
      builtAt:
        typeof raw.builtAt === 'string' ? raw.builtAt.slice(0, 40) : undefined,
      downloadUrl: DOWNLOAD_PAGE_URL,
      releaseNotes: Array.isArray(raw.releaseNotes)
        ? raw.releaseNotes
            .filter((n): n is string => typeof n === 'string')
            .map((n) => n.slice(0, 180))
            .slice(0, 8)
        : undefined,
    };

    const semverCmp = compareSemver(remote.version, installed.version);
    const newerCode =
      semverCmp === 0 &&
      remoteCode !== undefined &&
      remoteCode > installed.versionCode;

    return {
      status:
        semverCmp > 0 || newerCode ? 'update-available' : 'up-to-date',
      installed,
      remote,
      checkedAt,
    };
  } catch (err) {
    return {
      status: 'error',
      installed,
      errorMessage: sanitizeErrorMessage(err, 120),
      checkedAt,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
