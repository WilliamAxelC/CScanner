import { Platform } from 'react-native';
import { getInstalledAppInfo } from '../updates/updateChecker';
import type { AppSettings } from '../../types/models';
import type { StorageStats } from '../../storage/types';
import { sanitizeErrorMessage } from '../../utils/security';

export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  source: string;
  message: string;
}

const MAX_ENTRIES = 30;
const errorRing: ErrorLogEntry[] = [];
let seq = 0;

/**
 * Redacts tokens, emails, account/card digit runs, and filesystem user paths.
 */
export function redactSensitiveText(input: unknown): string {
  return sanitizeErrorMessage(input, 320);
}

export function recordError(source: string, error: unknown): ErrorLogEntry {
  const cleanSource = String(source || 'App').slice(0, 60);
  const entry: ErrorLogEntry = {
    id: `${Date.now()}-${++seq}`,
    timestamp: Date.now(),
    source: cleanSource,
    message: redactSensitiveText(error),
  };
  errorRing.unshift(entry);
  if (errorRing.length > MAX_ENTRIES) {
    errorRing.length = MAX_ENTRIES;
  }
  return entry;
}

export function getErrorLog(): ErrorLogEntry[] {
  return [...errorRing];
}

export function clearErrorLog(): void {
  errorRing.length = 0;
}

export function formatErrorLog(entries: ErrorLogEntry[] = errorRing): string {
  if (entries.length === 0) return 'No recent errors recorded.';
  return entries
    .map(
      (e) =>
        `[${new Date(e.timestamp).toISOString()}] (${e.source}) ${e.message}`,
    )
    .join('\n');
}

export function buildDiagnosticsReport(params: {
  settings: AppSettings;
  stats: StorageStats | null;
  includeErrors?: boolean;
}): string {
  const info = getInstalledAppInfo();
  const osLabel =
    Platform.OS === 'android'
      ? `Android API ${String(Platform.Version ?? 'unknown')}`
      : Platform.OS === 'web'
        ? 'Web Browser PWA'
        : `${Platform.OS} ${String(Platform.Version ?? '')}`;

  const lines = [
    `App: ${info.name} v${info.version} (build ${info.versionCode})`,
    `Package ID: ${info.packageId}`,
    `Platform: ${osLabel}`,
    `Theme: ${params.settings.theme} | High Contrast: ${params.settings.highContrast} | Reduce Motion: ${params.settings.reduceMotion} | Font Scale: ${Math.round(params.settings.fontScale * 100)}%`,
    `Defaults: filter=${params.settings.defaultFilter}, pageSize=${params.settings.defaultPageSize}, quality=${params.settings.defaultQuality}, autoOcr=${params.settings.autoOcr}`,
  ];

  if (params.stats) {
    lines.push(
      `Local Store: ${params.stats.docCount} docs, ${params.stats.pageCount} pages, ${params.stats.signatureCount} signatures, ${params.stats.pendingSyncCount} pending sync`,
    );
  }

  if (params.includeErrors !== false) {
    lines.push('');
    lines.push('Sanitized Recent Error Log:');
    lines.push(formatErrorLog());
  }

  return lines.join('\n');
}
