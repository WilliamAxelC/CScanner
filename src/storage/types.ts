import type {
  AppSettings,
  Document,
  Folder,
  Page,
  SavedSignature,
  SyncOperation,
} from '../types/models';

export interface StorageAdapter {
  init(): Promise<void>;

  listFolders(options?: { includeDeleted?: boolean }): Promise<Folder[]>;
  upsertFolder(folder: Folder): Promise<void>;

  listDocuments(options?: { includeDeleted?: boolean }): Promise<Document[]>;
  getDocument(id: string): Promise<Document | null>;
  upsertDocument(doc: Document): Promise<void>;
  searchDocuments(query: string): Promise<Document[]>;

  listPages(documentId: string): Promise<Page[]>;
  getPage(pageId: string): Promise<Page | null>;
  upsertPage(page: Page): Promise<void>;
  deletePage(pageId: string): Promise<void>;

  listSignatures(): Promise<SavedSignature[]>;
  upsertSignature(sig: SavedSignature): Promise<void>;
  deleteSignature(id: string): Promise<void>;

  listSyncQueue(): Promise<SyncOperation[]>;
  enqueueSync(op: SyncOperation): Promise<void>;
  removeSyncOp(id: string): Promise<void>;
  incrementSyncAttempt(id: string): Promise<void>;

  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;

  saveImageBytes(
    id: string,
    bytes: Uint8Array,
    ext?: 'jpg' | 'png',
  ): Promise<string>;
  readImageBytes(uri: string): Promise<Uint8Array>;
  deleteImage(uri: string): Promise<void>;
}
