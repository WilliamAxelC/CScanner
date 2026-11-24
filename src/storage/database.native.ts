import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
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
import type { StorageAdapter } from './types';

let dbInstance: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('cscanner.db');
  }
  return dbInstance;
}

function getImagesDir(): Directory {
  const dir = new Directory(Paths.document, 'cscanner', 'images');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

export async function resolveDisplayUri(uri: string): Promise<string> {
  return uri;
}

interface FolderRow {
  id: string;
  name: string;
  drive_folder_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface DocumentRow {
  id: string;
  title: string;
  folder_id: string | null;
  tags_json: string;
  page_ids_json: string;
  ocr_full_text: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  sync_status: Document['syncStatus'];
  drive_file_id: string | null;
  drive_meta_file_id: string | null;
  last_synced_at: number | null;
}

interface PageRow {
  id: string;
  document_id: string;
  order_index: number;
  original_uri: string;
  processed_uri: string;
  width: number;
  height: number;
  quad_json: string | null;
  rotation: 0 | 90 | 180 | 270;
  filter: Page['filter'];
  brightness: number;
  contrast: number;
  ocr_text: string;
  ocr_blocks_json: string;
  annotations_json: string;
  drive_image_file_id: string | null;
  updated_at: number;
}

interface SignatureRow {
  id: string;
  name: string;
  svg_path_data: string;
  png_uri: string;
  width: number;
  height: number;
  created_at: number;
}

interface SyncQueueRow {
  id: string;
  entity_type: SyncOperation['entityType'];
  entity_id: string;
  action: SyncOperation['action'];
  payload_json: string;
  created_at: number;
  attempts: number;
}

function mapDocRow(r: DocumentRow): Document {
  return {
    id: r.id,
    title: r.title,
    folderId: r.folder_id,
    tags: JSON.parse(r.tags_json || '[]'),
    pageIds: JSON.parse(r.page_ids_json || '[]'),
    ocrFullText: r.ocr_full_text || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    syncStatus: r.sync_status,
    driveFileId: r.drive_file_id ?? undefined,
    driveMetaFileId: r.drive_meta_file_id ?? undefined,
    lastSyncedAt: r.last_synced_at ?? undefined,
  };
}

function mapPageRow(r: PageRow): Page {
  return {
    id: r.id,
    documentId: r.document_id,
    orderIndex: r.order_index,
    originalUri: r.original_uri,
    processedUri: r.processed_uri,
    width: r.width,
    height: r.height,
    quad: r.quad_json ? JSON.parse(r.quad_json) : undefined,
    rotation: r.rotation,
    filter: r.filter,
    brightness: r.brightness,
    contrast: r.contrast,
    ocrText: r.ocr_text || '',
    ocrBlocks: JSON.parse(r.ocr_blocks_json || '[]'),
    annotations: JSON.parse(r.annotations_json || '[]'),
    driveImageFileId: r.drive_image_file_id ?? undefined,
    updatedAt: r.updated_at,
  };
}

class NativeStorageAdapter implements StorageAdapter {
  async init(): Promise<void> {
    getImagesDir();
    const db = await getDb();
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        drive_folder_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        folder_id TEXT,
        tags_json TEXT NOT NULL,
        page_ids_json TEXT NOT NULL,
        ocr_full_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        sync_status TEXT NOT NULL,
        drive_file_id TEXT,
        drive_meta_file_id TEXT,
        last_synced_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        original_uri TEXT NOT NULL,
        processed_uri TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        quad_json TEXT,
        rotation INTEGER NOT NULL,
        filter TEXT NOT NULL,
        brightness REAL NOT NULL,
        contrast REAL NOT NULL,
        ocr_text TEXT NOT NULL,
        ocr_blocks_json TEXT NOT NULL,
        annotations_json TEXT NOT NULL,
        drive_image_file_id TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_pages_doc ON pages(document_id, order_index);
      CREATE TABLE IF NOT EXISTS signatures (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        svg_path_data TEXT NOT NULL,
        png_uri TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        doc_id UNINDEXED,
        title,
        tags,
        ocr_text
      );
    `);
  }

  async listFolders(options?: { includeDeleted?: boolean }): Promise<Folder[]> {
    const db = await getDb();
    const sql = options?.includeDeleted
      ? 'SELECT * FROM folders ORDER BY name ASC'
      : 'SELECT * FROM folders WHERE deleted_at IS NULL ORDER BY name ASC';
    const rows = await db.getAllAsync<FolderRow>(sql);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      driveFolderId: r.drive_folder_id ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
    }));
  }

  async upsertFolder(folder: Folder): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO folders (id, name, drive_folder_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.name,
        folder.driveFolderId ?? null,
        folder.createdAt,
        folder.updatedAt,
        folder.deletedAt,
      ],
    );
  }

  async listDocuments(options?: {
    includeDeleted?: boolean;
  }): Promise<Document[]> {
    const db = await getDb();
    const sql = options?.includeDeleted
      ? 'SELECT * FROM documents ORDER BY updated_at DESC'
      : 'SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC';
    const rows = await db.getAllAsync<DocumentRow>(sql);
    return rows.map(mapDocRow);
  }

  async getDocument(id: string): Promise<Document | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<DocumentRow>(
      'SELECT * FROM documents WHERE id = ?',
      [id],
    );
    return row ? mapDocRow(row) : null;
  }

  async upsertDocument(doc: Document): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO documents
       (id, title, folder_id, tags_json, page_ids_json, ocr_full_text, created_at, updated_at, deleted_at, sync_status, drive_file_id, drive_meta_file_id, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        doc.title,
        doc.folderId,
        JSON.stringify(doc.tags),
        JSON.stringify(doc.pageIds),
        doc.ocrFullText,
        doc.createdAt,
        doc.updatedAt,
        doc.deletedAt,
        doc.syncStatus,
        doc.driveFileId ?? null,
        doc.driveMetaFileId ?? null,
        doc.lastSyncedAt ?? null,
      ],
    );
    await db.runAsync('DELETE FROM documents_fts WHERE doc_id = ?', [doc.id]);
    if (doc.deletedAt === null) {
      await db.runAsync(
        'INSERT INTO documents_fts (doc_id, title, tags, ocr_text) VALUES (?, ?, ?, ?)',
        [doc.id, doc.title, doc.tags.join(' '), doc.ocrFullText],
      );
    }
  }

  async searchDocuments(query: string): Promise<Document[]> {
    const trimmed = query.trim();
    if (!trimmed) return this.listDocuments();

    const db = await getDb();
    const terms = trimmed
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
      .filter(Boolean);

    if (terms.length > 0) {
      const matchQuery = terms.map((t) => `${t}*`).join(' AND ');
      try {
        const rows = await db.getAllAsync<DocumentRow>(
          `SELECT d.* FROM documents d
           JOIN documents_fts f ON d.id = f.doc_id
           WHERE d.deleted_at IS NULL AND documents_fts MATCH ?
           ORDER BY d.updated_at DESC`,
          [matchQuery],
        );
        return rows.map(mapDocRow);
      } catch {
        // Fallback to LIKE below
      }
    }

    const like = `%${trimmed}%`;
    const rows = await db.getAllAsync<DocumentRow>(
      `SELECT * FROM documents
       WHERE deleted_at IS NULL AND (title LIKE ? OR tags_json LIKE ? OR ocr_full_text LIKE ?)
       ORDER BY updated_at DESC`,
      [like, like, like],
    );
    return rows.map(mapDocRow);
  }

  async listPages(documentId: string): Promise<Page[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<PageRow>(
      'SELECT * FROM pages WHERE document_id = ? ORDER BY order_index ASC',
      [documentId],
    );
    return rows.map(mapPageRow);
  }

  async getPage(pageId: string): Promise<Page | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<PageRow>(
      'SELECT * FROM pages WHERE id = ?',
      [pageId],
    );
    return row ? mapPageRow(row) : null;
  }

  async upsertPage(page: Page): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO pages
       (id, document_id, order_index, original_uri, processed_uri, width, height, quad_json, rotation, filter, brightness, contrast, ocr_text, ocr_blocks_json, annotations_json, drive_image_file_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        page.id,
        page.documentId,
        page.orderIndex,
        page.originalUri,
        page.processedUri,
        page.width,
        page.height,
        page.quad ? JSON.stringify(page.quad) : null,
        page.rotation,
        page.filter,
        page.brightness,
        page.contrast,
        page.ocrText,
        JSON.stringify(page.ocrBlocks),
        JSON.stringify(page.annotations),
        page.driveImageFileId ?? null,
        page.updatedAt,
      ],
    );
  }

  async deletePage(pageId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM pages WHERE id = ?', [pageId]);
  }

  async listSignatures(): Promise<SavedSignature[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<SignatureRow>(
      'SELECT * FROM signatures ORDER BY created_at DESC',
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      svgPathData: r.svg_path_data,
      pngUri: r.png_uri,
      width: r.width,
      height: r.height,
      createdAt: r.created_at,
    }));
  }

  async upsertSignature(sig: SavedSignature): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO signatures (id, name, svg_path_data, png_uri, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sig.id,
        sig.name,
        sig.svgPathData,
        sig.pngUri,
        sig.width,
        sig.height,
        sig.createdAt,
      ],
    );
  }

  async deleteSignature(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM signatures WHERE id = ?', [id]);
  }

  async listSyncQueue(): Promise<SyncOperation[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<SyncQueueRow>(
      'SELECT * FROM sync_queue ORDER BY created_at ASC',
    );
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      payloadJson: r.payload_json,
      createdAt: r.created_at,
      attempts: r.attempts,
    }));
  }

  async enqueueSync(op: SyncOperation): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO sync_queue (id, entity_type, entity_id, action, payload_json, created_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        op.id,
        op.entityType,
        op.entityId,
        op.action,
        op.payloadJson,
        op.createdAt,
        op.attempts,
      ],
    );
  }

  async removeSyncOp(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async incrementSyncAttempt(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?',
      [id],
    );
  }

  async getSettings(): Promise<AppSettings> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value_json: string }>(
      'SELECT value_json FROM settings WHERE key = ?',
      ['app_settings'],
    );
    if (!row) return DEFAULT_APP_SETTINGS;
    return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(row.value_json) };
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)',
      ['app_settings', JSON.stringify(settings)],
    );
  }

  async saveImageBytes(
    id: string,
    bytes: Uint8Array,
    ext: 'jpg' | 'png' = 'jpg',
  ): Promise<string> {
    const dir = getImagesDir();
    const file = new File(dir, `${id}.${ext}`);
    file.create({ intermediates: true, overwrite: true });
    await file.write(bytes);
    return file.uri;
  }

  async readImageBytes(uri: string): Promise<Uint8Array> {
    if (uri.startsWith('data:')) {
      const comma = uri.indexOf(',');
      if (comma !== -1) {
        return base64ToUint8(uri.slice(comma + 1));
      }
    }
    try {
      const file = new File(uri);
      return await file.bytes();
    } catch {
      const res = await fetch(uri);
      return new Uint8Array(await res.arrayBuffer());
    }
  }

  async deleteImage(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // ignore missing/unowned files
    }
  }
}

export const storage: StorageAdapter = new NativeStorageAdapter();
