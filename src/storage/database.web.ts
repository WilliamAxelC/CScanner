import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type Document,
  type Folder,
  type Page,
  type SavedSignature,
  type SyncOperation,
} from '../types/models';
import { base64ToUint8 } from '../utils/format';
import { assertSafeAssetId, isSafeLocalFetchUri } from '../utils/security';
import type { StorageAdapter, StorageStats } from './types';

interface BlobRecord {
  id: string;
  mimeType: string;
  buffer: ArrayBuffer;
}

interface CScannerDB extends DBSchema {
  folders: { key: string; value: Folder };
  documents: { key: string; value: Document };
  pages: {
    key: string;
    value: Page;
    indexes: { 'by-document': string };
  };
  signatures: { key: string; value: SavedSignature };
  syncQueue: { key: string; value: SyncOperation };
  settings: { key: string; value: { key: string; value: AppSettings } };
  blobs: { key: string; value: BlobRecord };
}

const DB_NAME = 'cscanner-db';
const DB_VERSION = 1;
const BLOB_URI_PREFIX = 'idb-blob://';

let dbPromise: Promise<IDBPDatabase<CScannerDB>> | null = null;
const objectUrlCache = new Map<string, string>();

function getDb(): Promise<IDBPDatabase<CScannerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CScannerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pages')) {
          const pages = db.createObjectStore('pages', { keyPath: 'id' });
          pages.createIndex('by-document', 'documentId');
        }
        if (!db.objectStoreNames.contains('signatures')) {
          db.createObjectStore('signatures', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function resolveDisplayUri(uri: string): Promise<string> {
  if (!uri || !uri.startsWith(BLOB_URI_PREFIX)) {
    return uri;
  }
  const id = uri.slice(BLOB_URI_PREFIX.length);
  const cached = objectUrlCache.get(id);
  if (cached) return cached;

  const db = await getDb();
  const rec = await db.get('blobs', id);
  if (!rec) return '';
  const blob = new Blob([rec.buffer], { type: rec.mimeType });
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
}

class WebStorageAdapter implements StorageAdapter {
  async init(): Promise<void> {
    await getDb();
  }

  async listFolders(options?: { includeDeleted?: boolean }): Promise<Folder[]> {
    const db = await getDb();
    const all = await db.getAll('folders');
    const filtered = options?.includeDeleted
      ? all
      : all.filter((f) => f.deletedAt === null);
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsertFolder(folder: Folder): Promise<void> {
    const db = await getDb();
    await db.put('folders', folder);
  }

  async listDocuments(options?: {
    includeDeleted?: boolean;
  }): Promise<Document[]> {
    const db = await getDb();
    const all = await db.getAll('documents');
    const filtered = options?.includeDeleted
      ? all
      : all.filter((d) => d.deletedAt === null);
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getDocument(id: string): Promise<Document | null> {
    const db = await getDb();
    return (await db.get('documents', id)) ?? null;
  }

  async upsertDocument(doc: Document): Promise<void> {
    const db = await getDb();
    await db.put('documents', doc);
  }

  async searchDocuments(query: string): Promise<Document[]> {
    const docs = await this.listDocuments();
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return docs;

    return docs.filter((doc) => {
      const haystack = [
        doc.title,
        doc.tags.join(' '),
        doc.ocrFullText,
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }

  async listPages(documentId: string): Promise<Page[]> {
    const db = await getDb();
    const pages = await db.getAllFromIndex('pages', 'by-document', documentId);
    return pages.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getPage(pageId: string): Promise<Page | null> {
    const db = await getDb();
    return (await db.get('pages', pageId)) ?? null;
  }

  async upsertPage(page: Page): Promise<void> {
    const db = await getDb();
    await db.put('pages', page);
  }

  async deletePage(pageId: string): Promise<void> {
    const db = await getDb();
    await db.delete('pages', pageId);
  }

  async listSignatures(): Promise<SavedSignature[]> {
    const db = await getDb();
    const all = await db.getAll('signatures');
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async upsertSignature(sig: SavedSignature): Promise<void> {
    const db = await getDb();
    await db.put('signatures', sig);
  }

  async deleteSignature(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('signatures', id);
  }

  async listSyncQueue(): Promise<SyncOperation[]> {
    const db = await getDb();
    const all = await db.getAll('syncQueue');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  async enqueueSync(op: SyncOperation): Promise<void> {
    const db = await getDb();
    await db.put('syncQueue', op);
  }

  async removeSyncOp(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('syncQueue', id);
  }

  async incrementSyncAttempt(id: string): Promise<void> {
    const db = await getDb();
    const op = await db.get('syncQueue', id);
    if (op) {
      await db.put('syncQueue', { ...op, attempts: op.attempts + 1 });
    }
  }

  async getSettings(): Promise<AppSettings> {
    const db = await getDb();
    const rec = await db.get('settings', 'app_settings');
    return rec ? { ...DEFAULT_APP_SETTINGS, ...rec.value } : DEFAULT_APP_SETTINGS;
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await getDb();
    await db.put('settings', { key: 'app_settings', value: settings });
  }

  async saveImageBytes(
    id: string,
    bytes: Uint8Array,
    ext: 'jpg' | 'png' = 'jpg',
  ): Promise<string> {
    const safeId = assertSafeAssetId(id);
    const db = await getDb();
    const key = `${safeId}.${ext}`;
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await db.put('blobs', { id: key, mimeType, buffer: copy.buffer });
    const oldUrl = objectUrlCache.get(key);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      objectUrlCache.delete(key);
    }
    return `${BLOB_URI_PREFIX}${key}`;
  }

  async readImageBytes(uri: string): Promise<Uint8Array> {
    if (uri.startsWith(BLOB_URI_PREFIX)) {
      const db = await getDb();
      const key = uri.slice(BLOB_URI_PREFIX.length);
      const rec = await db.get('blobs', key);
      if (!rec) throw new Error(`Image blob not found: ${key}`);
      return new Uint8Array(rec.buffer);
    }
    if (uri.startsWith('data:')) {
      const comma = uri.indexOf(',');
      if (comma !== -1) {
        return base64ToUint8(uri.slice(comma + 1));
      }
    }
    if (!isSafeLocalFetchUri(uri)) {
      throw new Error('Blocked unsafe URI scheme when reading local image');
    }
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to fetch image bytes: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async deleteImage(uri: string): Promise<void> {
    if (!uri.startsWith(BLOB_URI_PREFIX)) return;
    const db = await getDb();
    const key = uri.slice(BLOB_URI_PREFIX.length);
    const oldUrl = objectUrlCache.get(key);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      objectUrlCache.delete(key);
    }
    await db.delete('blobs', key);
  }

  async getStorageStats(): Promise<StorageStats> {
    const db = await getDb();
    const [docs, pages, sigs, queue, blobs] = await Promise.all([
      db.getAll('documents'),
      db.getAll('pages'),
      db.getAll('signatures'),
      db.getAll('syncQueue'),
      db.getAll('blobs'),
    ]);
    const activeDocIds = new Set(
      docs.filter((d) => d.deletedAt === null).map((d) => d.id),
    );
    const activePages = pages.filter((p) => activeDocIds.has(p.documentId));
    let imageBytes = 0;
    for (const b of blobs) {
      imageBytes += b.buffer.byteLength;
    }
    return {
      docCount: activeDocIds.size,
      pageCount: activePages.length,
      signatureCount: sigs.length,
      pendingSyncCount: queue.length,
      imageBytes,
    };
  }

  async clearCache(): Promise<number> {
    const db = await getDb();
    const [docs, pages, sigs, blobs] = await Promise.all([
      db.getAll('documents'),
      db.getAll('pages'),
      db.getAll('signatures'),
      db.getAll('blobs'),
    ]);
    const activeDocIds = new Set(
      docs.filter((d) => d.deletedAt === null).map((d) => d.id),
    );
    const liveKeys = new Set<string>();
    for (const p of pages) {
      if (!activeDocIds.has(p.documentId)) continue;
      if (p.originalUri.startsWith(BLOB_URI_PREFIX)) {
        liveKeys.add(p.originalUri.slice(BLOB_URI_PREFIX.length));
      }
      if (p.processedUri.startsWith(BLOB_URI_PREFIX)) {
        liveKeys.add(p.processedUri.slice(BLOB_URI_PREFIX.length));
      }
    }
    for (const s of sigs) {
      if (s.pngUri.startsWith(BLOB_URI_PREFIX)) {
        liveKeys.add(s.pngUri.slice(BLOB_URI_PREFIX.length));
      }
    }

    let freed = 0;
    for (const b of blobs) {
      if (!liveKeys.has(b.id)) {
        freed += b.buffer.byteLength;
        const oldUrl = objectUrlCache.get(b.id);
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
          objectUrlCache.delete(b.id);
        }
        await db.delete('blobs', b.id);
      }
    }
    return freed;
  }

  async eraseAllData(): Promise<void> {
    const db = await getDb();
    for (const url of objectUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    objectUrlCache.clear();
    await Promise.all([
      db.clear('folders'),
      db.clear('documents'),
      db.clear('pages'),
      db.clear('signatures'),
      db.clear('syncQueue'),
      db.clear('settings'),
      db.clear('blobs'),
    ]);
  }
}

export const storage: StorageAdapter = new WebStorageAdapter();
