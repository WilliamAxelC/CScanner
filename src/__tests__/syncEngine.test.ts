import { describe, expect, it } from 'vitest';
import type { DriveClient, DriveFile } from '../services/sync/driveApi';
import { SyncEngine } from '../services/sync/syncEngine';
import type { StorageAdapter } from '../storage/types';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type Document,
  type Folder,
  type Page,
  type SavedSignature,
  type SyncOperation,
} from '../types/models';

class InMemoryStorage implements StorageAdapter {
  folders = new Map<string, Folder>();
  docs = new Map<string, Document>();
  pages = new Map<string, Page>();
  signatures = new Map<string, SavedSignature>();
  syncQueue = new Map<string, SyncOperation>();
  images = new Map<string, Uint8Array>();
  settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

  async init() {}

  async listFolders(options?: { includeDeleted?: boolean }): Promise<Folder[]> {
    const all = Array.from(this.folders.values());
    return options?.includeDeleted
      ? all
      : all.filter((f) => f.deletedAt === null);
  }

  async upsertFolder(folder: Folder) {
    this.folders.set(folder.id, folder);
  }

  async listDocuments(options?: {
    includeDeleted?: boolean;
  }): Promise<Document[]> {
    const all = Array.from(this.docs.values());
    return options?.includeDeleted
      ? all
      : all.filter((d) => d.deletedAt === null);
  }

  async getDocument(id: string) {
    return this.docs.get(id) ?? null;
  }

  async upsertDocument(doc: Document) {
    this.docs.set(doc.id, doc);
  }

  async searchDocuments(query: string) {
    const q = query.trim().toLowerCase();
    return (await this.listDocuments()).filter((d) =>
      `${d.title} ${d.tags.join(' ')} ${d.ocrFullText}`
        .toLowerCase()
        .includes(q),
    );
  }

  async listPages(documentId: string) {
    return Array.from(this.pages.values())
      .filter((p) => p.documentId === documentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getPage(pageId: string) {
    return this.pages.get(pageId) ?? null;
  }

  async upsertPage(page: Page) {
    this.pages.set(page.id, page);
  }

  async deletePage(pageId: string) {
    this.pages.delete(pageId);
  }

  async listSignatures() {
    return Array.from(this.signatures.values());
  }

  async upsertSignature(sig: SavedSignature) {
    this.signatures.set(sig.id, sig);
  }

  async deleteSignature(id: string) {
    this.signatures.delete(id);
  }

  async listSyncQueue() {
    return Array.from(this.syncQueue.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  async enqueueSync(op: SyncOperation) {
    this.syncQueue.set(op.id, op);
  }

  async removeSyncOp(id: string) {
    this.syncQueue.delete(id);
  }

  async incrementSyncAttempt(id: string) {
    const op = this.syncQueue.get(id);
    if (op) this.syncQueue.set(id, { ...op, attempts: op.attempts + 1 });
  }

  async getSettings() {
    return this.settings;
  }

  async saveSettings(settings: AppSettings) {
    this.settings = settings;
  }

  async saveImageBytes(id: string, bytes: Uint8Array, ext = 'jpg') {
    const uri = `mem://${id}.${ext}`;
    this.images.set(uri, new Uint8Array(bytes));
    return uri;
  }

  async readImageBytes(uri: string) {
    const b = this.images.get(uri);
    if (!b) throw new Error(`Missing image ${uri}`);
    return b;
  }

  async deleteImage(uri: string) {
    this.images.delete(uri);
  }
}

class InMemoryDrive implements DriveClient {
  private seq = 1;
  files = new Map<
    string,
    { meta: DriveFile; bytes: Uint8Array; trashed: boolean }
  >();

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const targetParent = parentId || 'root';
    for (const entry of this.files.values()) {
      if (
        !entry.trashed &&
        entry.meta.mimeType === 'application/vnd.google-apps.folder' &&
        entry.meta.name === name &&
        (entry.meta.parents?.[0] ?? 'root') === targetParent
      ) {
        return entry.meta.id;
      }
    }
    const id = `drv_${this.seq++}`;
    this.files.set(id, {
      meta: {
        id,
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [targetParent],
        modifiedTime: new Date().toISOString(),
      },
      bytes: new Uint8Array(0),
      trashed: false,
    });
    return id;
  }

  async listFiles(query: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    const nameMatch = /name = '([^']+)'/.exec(query);
    const parentMatch = /'([^']+)' in parents/.exec(query);
    const mimeMatch = /mimeType = '([^']+)'/.exec(query);

    for (const entry of this.files.values()) {
      if (entry.trashed) continue;
      if (nameMatch && entry.meta.name !== nameMatch[1]) continue;
      if (
        parentMatch &&
        !(entry.meta.parents ?? []).includes(parentMatch[1])
      ) {
        continue;
      }
      if (mimeMatch && entry.meta.mimeType !== mimeMatch[1]) continue;
      out.push(entry.meta);
    }
    return out;
  }

  async uploadMultipart(
    metadata: { name: string; mimeType: string; parents?: string[] },
    bytes: Uint8Array,
    existingFileId?: string,
  ): Promise<DriveFile> {
    if (existingFileId && this.files.has(existingFileId)) {
      const prev = this.files.get(existingFileId)!;
      prev.meta = {
        ...prev.meta,
        name: metadata.name,
        mimeType: metadata.mimeType,
        modifiedTime: new Date().toISOString(),
      };
      prev.bytes = new Uint8Array(bytes);
      return prev.meta;
    }
    const id = `drv_${this.seq++}`;
    const meta: DriveFile = {
      id,
      name: metadata.name,
      mimeType: metadata.mimeType,
      parents: metadata.parents ?? ['root'],
      modifiedTime: new Date().toISOString(),
    };
    this.files.set(id, { meta, bytes: new Uint8Array(bytes), trashed: false });
    return meta;
  }

  async downloadBytes(fileId: string): Promise<Uint8Array> {
    const f = this.files.get(fileId);
    if (!f) throw new Error(`Drive file not found: ${fileId}`);
    return f.bytes;
  }

  async trashFile(fileId: string): Promise<void> {
    const f = this.files.get(fileId);
    if (f) f.trashed = true;
  }
}

describe('Google Drive Offline-First Sync Engine', () => {
  it('pushes visible PDF + metadata from Device A, pulls onto Device B, and handles conflicts safely', async () => {
    const drive = new InMemoryDrive();
    const deviceA = new InMemoryStorage();
    const deviceB = new InMemoryStorage();

    const makeDeps = () => ({
      buildVisiblePdf: async (doc: Document) =>
        new TextEncoder().encode(`%PDF-1.4 ${doc.title}`),
    });

    const now = 1_700_000_000_000;
    const folder: Folder = {
      id: 'fld_receipts',
      name: 'Receipts',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await deviceA.upsertFolder(folder);
    await deviceA.enqueueSync({
      id: 'op_f1',
      entityType: 'folder',
      entityId: folder.id,
      action: 'upsert',
      payloadJson: '{}',
      createdAt: now,
      attempts: 0,
    });

    const origUri = await deviceA.saveImageBytes(
      'orig_p1',
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      'jpg',
    );
    const page: Page = {
      id: 'p1',
      documentId: 'doc1',
      orderIndex: 0,
      originalUri: origUri,
      processedUri: origUri,
      width: 1000,
      height: 1400,
      rotation: 0,
      filter: 'magic',
      brightness: 0,
      contrast: 0,
      ocrText: 'Total $5.50',
      ocrBlocks: [{ text: 'Total $5.50', x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
      annotations: [],
      updatedAt: now,
    };
    await deviceA.upsertPage(page);

    const doc: Document = {
      id: 'doc1',
      title: 'Coffee Receipt',
      folderId: folder.id,
      tags: ['expense'],
      pageIds: ['p1'],
      ocrFullText: 'Total $5.50',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    };
    await deviceA.upsertDocument(doc);
    await deviceA.enqueueSync({
      id: 'op_d1',
      entityType: 'document',
      entityId: doc.id,
      action: 'upsert',
      payloadJson: '{}',
      createdAt: now + 1,
      attempts: 0,
    });

    // 1. Device A pushes
    const engineA = new SyncEngine(deviceA, drive, makeDeps());
    const resA = await engineA.sync();
    expect(resA.errors).toEqual([]);
    expect(resA.pushedDocs).toBe(1);
    expect((await deviceA.listSyncQueue()).length).toBe(0);

    const syncedDocA = await deviceA.getDocument('doc1');
    expect(syncedDocA?.syncStatus).toBe('synced');
    expect(syncedDocA?.driveFileId).toBeTruthy();
    expect(syncedDocA?.driveMetaFileId).toBeTruthy();

    // Visible PDF exists in Drive under Receipts
    const allDriveFiles = Array.from(drive.files.values()).map((e) => e.meta.name);
    expect(allDriveFiles).toContain('CScanner');
    expect(allDriveFiles).toContain('.cscanner-meta');
    expect(allDriveFiles).toContain('Receipts');
    expect(allDriveFiles).toContain('Coffee Receipt.pdf');
    expect(allDriveFiles).toContain('doc-doc1.json');

    // 2. Device B pulls seamlessly
    const engineB = new SyncEngine(deviceB, drive, makeDeps());
    const resB = await engineB.sync();
    expect(resB.errors).toEqual([]);
    expect(resB.pulledDocs).toBe(1);

    const pulledDoc = await deviceB.getDocument('doc1');
    expect(pulledDoc?.title).toBe('Coffee Receipt');
    expect(pulledDoc?.ocrFullText).toBe('Total $5.50');
    const pulledPages = await deviceB.listPages('doc1');
    expect(pulledPages).toHaveLength(1);
    const pulledBytes = await deviceB.readImageBytes(pulledPages[0].originalUri);
    expect(Array.from(pulledBytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    // 3. Concurrent offline conflict
    const t2 = Date.now() + 10_000;
    await deviceA.upsertDocument({
      ...(await deviceA.getDocument('doc1'))!,
      title: 'Coffee Receipt - Edited on A',
      updatedAt: t2,
      syncStatus: 'pending',
    });
    await deviceA.enqueueSync({
      id: 'op_d1_a',
      entityType: 'document',
      entityId: 'doc1',
      action: 'upsert',
      payloadJson: '{}',
      createdAt: t2,
      attempts: 0,
    });
    await engineA.sync();

    // Device B also edits doc1 locally before syncing (so syncStatus is 'pending', no push op needed for pull conflict test, or enqueue)
    await deviceB.upsertDocument({
      ...(await deviceB.getDocument('doc1'))!,
      title: 'Coffee Receipt - Edited Offline on B',
      updatedAt: t2 + 500,
      syncStatus: 'pending',
    });

    const conflictResB = await engineB.sync();
    expect(conflictResB.conflicts).toBe(1);
    const docsOnB = await deviceB.listDocuments();
    expect(docsOnB.map((d) => d.title).sort()).toEqual([
      'Coffee Receipt - Edited Offline on B',
      'Coffee Receipt - Edited on A (Conflict)',
    ]);
  });

  it('rejects malicious remote manifests and prevents cross-document page ID hijacking', async () => {
    const drive = new InMemoryDrive();
    const local = new InMemoryStorage();
    const engine = new SyncEngine(local, drive, {
      buildVisiblePdf: async (d) => new TextEncoder().encode(`%PDF-1.4 ${d.title}`),
    });

    const now = 1_700_000_000_000;
    const victimPageUri = await local.saveImageBytes(
      'orig_victim',
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]),
      'jpg',
    );
    await local.upsertDocument({
      id: 'victim_doc',
      title: 'Victim Doc',
      folderId: null,
      tags: [],
      pageIds: ['shared_page_id'],
      ocrFullText: 'Victim text',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'synced',
    });
    await local.upsertPage({
      id: 'shared_page_id',
      documentId: 'victim_doc',
      orderIndex: 0,
      originalUri: victimPageUri,
      processedUri: victimPageUri,
      width: 500,
      height: 700,
      rotation: 0,
      filter: 'original',
      brightness: 0,
      contrast: 0,
      ocrText: 'Victim text',
      ocrBlocks: [],
      annotations: [],
      updatedAt: now,
    });

    const rootId = await drive.ensureFolder('CScanner');
    const metaId = await drive.ensureFolder('.cscanner-meta', rootId);

    // 1. Malicious manifest whose id mismatches filename & attempts path traversal
    await drive.uploadMultipart(
      {
        name: 'doc-legit_id.json',
        mimeType: 'application/json',
        parents: [metaId],
      },
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          id: '../../escape',
          title: 'Malicious',
          pages: [],
        }),
      ),
    );

    // 2. Valid attacker document colliding on victim's page ID
    const attackerImg = await drive.uploadMultipart(
      { name: 'img-attacker.jpg', mimeType: 'image/jpeg', parents: [metaId] },
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
    );
    await drive.uploadMultipart(
      {
        name: 'doc-attacker_doc.json',
        mimeType: 'application/json',
        parents: [metaId],
      },
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          id: 'attacker_doc',
          title: 'Attacker Doc',
          folderId: null,
          tags: [],
          pageIds: ['shared_page_id'],
          ocrFullText: 'Hijacked',
          createdAt: now,
          updatedAt: now + 1000,
          deletedAt: null,
          pages: [
            {
              id: 'shared_page_id',
              orderIndex: 0,
              width: 500,
              height: 700,
              rotation: 0,
              filter: 'original',
              brightness: 0,
              contrast: 0,
              ocrText: 'Hijacked',
              ocrBlocks: [],
              annotations: [],
              driveImageFileId: attackerImg.id,
              updatedAt: now + 1000,
            },
          ],
        }),
      ),
    );

    const res = await engine.sync();
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(await local.getDocument('../../escape')).toBeNull();
    expect(await local.getDocument('legit_id')).toBeNull();

    // Victim doc's page must remain intact and owned by victim_doc
    const victimPage = await local.getPage('shared_page_id');
    expect(victimPage?.documentId).toBe('victim_doc');
    expect(victimPage?.ocrText).toBe('Victim text');

    // Attacker doc gets a distinct fresh page ID instead of overwriting victim's page
    const attackerPages = await local.listPages('attacker_doc');
    expect(attackerPages).toHaveLength(1);
    expect(attackerPages[0].id).not.toBe('shared_page_id');
  });
});
