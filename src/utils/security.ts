import type { RemoteDocumentManifest, RemotePageManifest } from '../services/sync/syncEngine';
import type { Annotation, FilterPreset, OcrBlock, Page, Quad } from '../types/models';

const SAFE_ASSET_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const SAFE_DRIVE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_MIME_RE = /^[a-zA-Z0-9.+/-]{3,127}$/;
const VALID_FILTERS = new Set<FilterPreset>([
  'original',
  'magic',
  'bw',
  'grayscale',
  'lighten',
]);
const VALID_ROTATIONS = new Set<0 | 90 | 180 | 270>([0, 90, 180, 270]);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Ensures asset/entity identifiers cannot traverse filesystems or inject path segments.
 */
export function assertSafeAssetId(id: string): string {
  if (typeof id !== 'string' || !SAFE_ASSET_ID_RE.test(id) || FORBIDDEN_KEYS.has(id)) {
    throw new Error('Invalid or unsafe identifier');
  }
  return id;
}

/**
 * Validates HTTP MIME type headers to forbid CR/LF header injection.
 */
export function assertValidMimeType(mime: string): string {
  if (typeof mime !== 'string' || /[\r\n\0]/.test(mime) || !SAFE_MIME_RE.test(mime)) {
    throw new Error('Invalid MIME type');
  }
  return mime;
}

/**
 * Escapes backslash and single-quote literals inside Google Drive `q` expressions.
 */
export function escapeDriveQueryValue(val: string): string {
  return String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Safe prototype-safe lookup into plain record maps keyed by URL/route IDs.
 */
export function getPagesForDoc<T>(
  pagesByDoc: Record<string, T[]>,
  docId?: string | null,
): T[] {
  if (!docId || !Object.prototype.hasOwnProperty.call(pagesByDoc, docId)) {
    return [];
  }
  const value = pagesByDoc[docId];
  return Array.isArray(value) ? value : [];
}

/**
 * Safely parses JSON payloads with fallback instead of propagating unhandled syntax exceptions.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/**
 * Restricts storage image read fallback fetches to safe local/blob/data schemes.
 */
export function isSafeLocalFetchUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('/')
  );
}

/**
 * Redacts tokens, emails, long card/account digit sequences, and absolute local directory prefixes.
 */
export function sanitizeErrorMessage(raw: unknown, maxLen = 220): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? 'Unknown error');
  let clean = msg
    .replace(/\r?\n|\t/g, ' ')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, '[redacted-token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/\b\d{12,19}\b/g, '[redacted-number]')
    .replace(/(file:\/\/|\/data\/|\/storage\/|\/home\/|\/Users\/)[^\s"'`)]*\/([^/\s"'`)]+)/g, '[path]/$2')
    .replace(/<[^>]{1,120}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) clean = 'Unexpected error';
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 3)}...` : clean;
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

function sanitizeQuad(raw: unknown): Quad | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const pts: Array<{ x: number; y: number }> = [];
  for (const item of raw) {
    if (!isPlainRecord(item)) return undefined;
    pts.push({
      x: clampFinite(item.x, 0, 1, 0),
      y: clampFinite(item.y, 0, 1, 0),
    });
  }
  return pts as Quad;
}

function sanitizeOcrBlocks(raw: unknown): OcrBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: OcrBlock[] = [];
  for (const b of raw.slice(0, 2000)) {
    if (!isPlainRecord(b) || typeof b.text !== 'string') continue;
    out.push({
      text: b.text.slice(0, 1000),
      x: clampFinite(b.x, 0, 1, 0),
      y: clampFinite(b.y, 0, 1, 0),
      width: clampFinite(b.width, 0, 1, 0.05),
      height: clampFinite(b.height, 0, 1, 0.02),
    });
  }
  return out;
}

function sanitizeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const a of raw.slice(0, 200)) {
    if (!isPlainRecord(a) || typeof a.id !== 'string' || !SAFE_ASSET_ID_RE.test(a.id)) {
      continue;
    }
    if (a.type === 'redact') {
      out.push({
        id: a.id,
        type: 'redact',
        x: clampFinite(a.x, 0, 1, 0),
        y: clampFinite(a.y, 0, 1, 0),
        width: clampFinite(a.width, 0.01, 1, 0.2),
        height: clampFinite(a.height, 0.01, 1, 0.08),
        color: a.color === '#FFFFFF' ? '#FFFFFF' : '#000000',
      });
    } else if (a.type === 'signature' && typeof a.signatureId === 'string' && SAFE_ASSET_ID_RE.test(a.signatureId)) {
      out.push({
        id: a.id,
        type: 'signature',
        signatureId: a.signatureId,
        x: clampFinite(a.x, 0, 1, 0.5),
        y: clampFinite(a.y, 0, 1, 0.7),
        width: clampFinite(a.width, 0.02, 1, 0.3),
        height: clampFinite(a.height, 0.02, 1, 0.14),
      });
    } else if (a.type === 'watermark' && typeof a.text === 'string') {
      out.push({
        id: a.id,
        type: 'watermark',
        text: a.text.slice(0, 120),
        opacity: clampFinite(a.opacity, 0.05, 0.85, 0.25),
        angle: clampFinite(a.angle, -180, 180, -35),
        tiled: Boolean(a.tiled),
        color: typeof a.color === 'string' && /^#[0-9A-Fa-f]{3,6}$/.test(a.color) ? a.color : '#64748B',
      });
    }
  }
  return out;
}

/**
 * Validates and reconstructs an untrusted Google Drive document manifest before applying locally.
 */
export function validateRemoteManifest(
  raw: unknown,
  expectedDocId?: string,
): RemoteDocumentManifest {
  if (!isPlainRecord(raw)) {
    throw new Error('Remote manifest must be an object');
  }
  if (raw.version !== 1) {
    throw new Error('Unsupported remote manifest version');
  }
  const id = assertSafeAssetId(String(raw.id ?? ''));
  if (expectedDocId && id !== expectedDocId) {
    throw new Error('Remote manifest ID mismatch with filename');
  }

  const title = typeof raw.title === 'string' ? raw.title.slice(0, 300) : 'Untitled Scan';
  const folderId =
    raw.folderId === null || raw.folderId === undefined
      ? null
      : assertSafeAssetId(String(raw.folderId));
  const folderName =
    typeof raw.folderName === 'string' ? raw.folderName.slice(0, 120) : raw.folderName === null ? null : undefined;

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 30)
    : [];

  if (!Array.isArray(raw.pages) || raw.pages.length > 200) {
    throw new Error('Remote manifest contains invalid or oversized pages array');
  }

  const pages: RemotePageManifest[] = [];
  for (let i = 0; i < raw.pages.length; i++) {
    const rp = raw.pages[i];
    if (!isPlainRecord(rp)) {
      throw new Error('Invalid page record in remote manifest');
    }
    const pageId = assertSafeAssetId(String(rp.id ?? ''));
    const rawFilter = rp.filter as FilterPreset;
    const filter: FilterPreset = VALID_FILTERS.has(rawFilter) ? rawFilter : 'original';
    const rawRot = rp.rotation as Page['rotation'];
    const rotation: Page['rotation'] = VALID_ROTATIONS.has(rawRot) ? rawRot : 0;
    const driveImageFileId =
      typeof rp.driveImageFileId === 'string' && SAFE_DRIVE_ID_RE.test(rp.driveImageFileId)
        ? rp.driveImageFileId
        : undefined;

    pages.push({
      id: pageId,
      orderIndex: clampFinite(rp.orderIndex, 0, 500, i),
      width: Math.round(clampFinite(rp.width, 1, 20000, 1000)),
      height: Math.round(clampFinite(rp.height, 1, 20000, 1400)),
      quad: sanitizeQuad(rp.quad),
      rotation,
      filter,
      brightness: clampFinite(rp.brightness, -100, 100, 0),
      contrast: clampFinite(rp.contrast, -100, 100, 0),
      ocrText: typeof rp.ocrText === 'string' ? rp.ocrText.slice(0, 100_000) : '',
      ocrBlocks: sanitizeOcrBlocks(rp.ocrBlocks),
      annotations: sanitizeAnnotations(rp.annotations),
      driveImageFileId,
      updatedAt: clampFinite(rp.updatedAt, 0, 9e15, Date.now()),
    });
  }

  const driveFileId =
    typeof raw.driveFileId === 'string' && SAFE_DRIVE_ID_RE.test(raw.driveFileId)
      ? raw.driveFileId
      : undefined;

  return {
    version: 1,
    id,
    title,
    folderId,
    folderName,
    tags,
    pageIds: pages.map((p) => p.id),
    ocrFullText: typeof raw.ocrFullText === 'string' ? raw.ocrFullText.slice(0, 500_000) : '',
    createdAt: clampFinite(raw.createdAt, 0, 9e15, Date.now()),
    updatedAt: clampFinite(raw.updatedAt, 0, 9e15, Date.now()),
    deletedAt: typeof raw.deletedAt === 'number' && Number.isFinite(raw.deletedAt) ? raw.deletedAt : null,
    driveFileId,
    pages,
  };
}
