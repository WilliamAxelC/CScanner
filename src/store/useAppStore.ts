import { Platform } from 'react-native';
import { create } from 'zustand';
import { clearErrorLog, recordError } from '../services/diagnostics/errorLog';
import { processImage } from '../services/image/processor';
import { recognizeImageText } from '../services/ocr/ocrService';
import { buildDocumentPdfBytes } from '../services/pdf/shareExport';
import { FetchDriveClient } from '../services/sync/driveApi';
import { loadStoredToken, saveStoredToken } from '../services/sync/googleAuth';
import { SyncEngine, type SyncResult } from '../services/sync/syncEngine';
import { storage } from '../storage';
import {
  DEFAULT_APP_SETTINGS,
  type Annotation,
  type AppSettings,
  type Document,
  type FilterPreset,
  type Folder,
  type Page,
  type Quad,
  type SavedSignature,
} from '../types/models';
import { generateId } from '../utils/ids';

export type SyncUiState = 'idle' | 'syncing' | 'error' | 'offline';

export interface NewPageInput {
  originalBytes?: Uint8Array;
  originalUri?: string;
  processedBytes?: Uint8Array;
  processedUri?: string;
  width: number;
  height: number;
  quad?: Quad;
  filter?: FilterPreset;
}

interface AppState {
  initialized: boolean;
  loading: boolean;
  folders: Folder[];
  documents: Document[];
  pagesByDoc: Record<string, Page[]>;
  signatures: SavedSignature[];
  settings: AppSettings;

  searchQuery: string;
  selectedFolderId: string | 'all' | 'unfiled';
  selectedTag: string | null;
  viewMode: 'grid' | 'list';

  syncState: SyncUiState;
  lastSyncError: string | null;
  pendingSyncCount: number;

  initApp: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  setSearchQuery: (q: string) => Promise<void>;
  setSelectedFolderId: (id: string | 'all' | 'unfiled') => void;
  setSelectedTag: (tag: string | null) => void;
  setViewMode: (mode: 'grid' | 'list') => void;

  createFolder: (name: string) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;

  createDocumentWithPages: (params: {
    title?: string;
    folderId?: string | null;
    pages: NewPageInput[];
    autoRunOcr?: boolean;
  }) => Promise<Document>;

  appendPagesToDocument: (
    docId: string,
    pages: NewPageInput[],
    autoRunOcr?: boolean,
  ) => Promise<void>;

  updateDocumentMeta: (
    docId: string,
    patch: Partial<Pick<Document, 'title' | 'folderId' | 'tags'>>,
  ) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;

  reorderPages: (docId: string, orderedPageIds: string[]) => Promise<void>;
  deletePageFromDoc: (docId: string, pageId: string) => Promise<void>;
  rotatePageQuick: (docId: string, pageId: string) => Promise<void>;

  updatePageEdits: (
    docId: string,
    pageId: string,
    edits: {
      quad?: Quad;
      rotation?: 0 | 90 | 180 | 270;
      filter?: FilterPreset;
      brightness?: number;
      contrast?: number;
      annotations?: Annotation[];
      reprocessImage?: boolean;
    },
  ) => Promise<Page>;

  runOcrForDocument: (docId: string, pageId?: string) => Promise<void>;
  updatePageOcrText: (
    docId: string,
    pageId: string,
    newText: string,
  ) => Promise<void>;

  saveNewSignature: (params: {
    name: string;
    svgPathData: string;
    pngBytes: Uint8Array;
    width: number;
    height: number;
  }) => Promise<SavedSignature>;
  deleteSignature: (id: string) => Promise<void>;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  triggerSync: (accessTokenOverride?: string) => Promise<SyncResult | null>;
  clearLocalCache: () => Promise<number>;
  eraseAllData: () => Promise<void>;
}

async function persistInputOrigin(
  pageId: string,
  input: NewPageInput,
): Promise<string> {
  if (input.originalBytes) {
    return storage.saveImageBytes(`orig_${pageId}`, input.originalBytes, 'jpg');
  }
  const uri = input.originalUri || '';
  // Native ML Kit writes temp scans to cacheDir; copy them into durable filesDir storage.
  if (
    Platform.OS !== 'web' &&
    uri &&
    !uri.includes('/cscanner/images/')
  ) {
    try {
      const bytes = await storage.readImageBytes(uri);
      const saved = await storage.saveImageBytes(`orig_${pageId}`, bytes, 'jpg');
      await storage.deleteImage(uri);
      return saved;
    } catch {
      return uri;
    }
  }
  return uri;
}

async function enqueue(
  entityType: 'document' | 'folder',
  entityId: string,
  action: 'upsert' | 'delete',
) {
  await storage.enqueueSync({
    id: `${entityType}:${entityId}`,
    entityType,
    entityId,
    action,
    payloadJson: '{}',
    createdAt: Date.now(),
    attempts: 0,
  });
}

function combineOcrText(pages: Page[]): string {
  return [...pages]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((p) => p.ocrText.trim())
    .filter(Boolean)
    .join('\n\n--- Page Break ---\n\n');
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  loading: false,
  folders: [],
  documents: [],
  pagesByDoc: {},
  signatures: [],
  settings: DEFAULT_APP_SETTINGS,

  searchQuery: '',
  selectedFolderId: 'all',
  selectedTag: null,
  viewMode: 'grid',

  syncState: 'idle',
  lastSyncError: null,
  pendingSyncCount: 0,

  initApp: async () => {
    if (get().initialized) return;
    set({ loading: true });
    await storage.init();
    await get().refreshLibrary();
    set({ initialized: true, loading: false });
  },

  refreshLibrary: async () => {
    const [folders, docs, signatures, settings, queue] = await Promise.all([
      storage.listFolders(),
      get().searchQuery.trim()
        ? storage.searchDocuments(get().searchQuery)
        : storage.listDocuments(),
      storage.listSignatures(),
      storage.getSettings(),
      storage.listSyncQueue(),
    ]);

    const pagesEntries = await Promise.all(
      docs.map(async (d) => [d.id, await storage.listPages(d.id)] as const),
    );
    const pagesByDoc: Record<string, Page[]> = {};
    for (const [docId, pages] of pagesEntries) {
      pagesByDoc[docId] = pages;
    }

    set({
      folders,
      documents: docs,
      pagesByDoc,
      signatures,
      settings,
      pendingSyncCount: queue.length,
    });
  },

  setSearchQuery: async (q: string) => {
    set({ searchQuery: q });
    const docs = q.trim()
      ? await storage.searchDocuments(q)
      : await storage.listDocuments();
    const pagesEntries = await Promise.all(
      docs.map(async (d) => [d.id, await storage.listPages(d.id)] as const),
    );
    const nextPages: Record<string, Page[]> = { ...get().pagesByDoc };
    for (const [docId, pages] of pagesEntries) {
      nextPages[docId] = pages;
    }
    set({ documents: docs, pagesByDoc: nextPages });
  },

  setSelectedFolderId: (id) => set({ selectedFolderId: id }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),
  setViewMode: (mode) => set({ viewMode: mode }),

  createFolder: async (name: string) => {
    const now = Date.now();
    const folder: Folder = {
      id: generateId(),
      name: name.trim() || 'New Folder',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await storage.upsertFolder(folder);
    await enqueue('folder', folder.id, 'upsert');
    await get().refreshLibrary();
    return folder;
  },

  deleteFolder: async (id: string) => {
    const now = Date.now();
    const folders = await storage.listFolders({ includeDeleted: true });
    const target = folders.find((f) => f.id === id);
    if (!target) return;
    await storage.upsertFolder({
      ...target,
      deletedAt: now,
      updatedAt: now,
    });
    // Unfile any docs inside this folder
    const docs = await storage.listDocuments();
    for (const d of docs) {
      if (d.folderId === id) {
        await storage.upsertDocument({
          ...d,
          folderId: null,
          updatedAt: now,
          syncStatus: 'pending',
        });
        await enqueue('document', d.id, 'upsert');
      }
    }
    await enqueue('folder', id, 'delete');
    if (get().selectedFolderId === id) {
      set({ selectedFolderId: 'all' });
    }
    await get().refreshLibrary();
  },

  createDocumentWithPages: async ({
    title,
    folderId,
    pages,
    autoRunOcr,
  }) => {
    const now = Date.now();
    const settings = get().settings;
    const docId = generateId();
    const defaultTitle =
      title?.trim() ||
      `Scan ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

    const createdPages: Page[] = [];
    for (let i = 0; i < pages.length; i++) {
      const input = pages[i];
      const pageId = generateId();
      const origUri = await persistInputOrigin(pageId, input);

      const filter = input.filter ?? settings.defaultFilter;
      let procUri = input.processedUri || origUri;
      let w = input.width;
      let h = input.height;

      if (input.processedBytes) {
        procUri = await storage.saveImageBytes(
          `proc_${pageId}`,
          input.processedBytes,
          'jpg',
        );
      } else if (!input.processedUri) {
        const processed = await processImage({
          inputUri: origUri,
          outputId: `proc_${pageId}`,
          quad: input.quad,
          rotation: 0,
          filter,
          brightness: 0,
          contrast: 0,
        });
        procUri = processed.uri;
        w = processed.width;
        h = processed.height;
      }

      const page: Page = {
        id: pageId,
        documentId: docId,
        orderIndex: i,
        originalUri: origUri,
        processedUri: procUri,
        width: w,
        height: h,
        quad: input.quad,
        rotation: 0,
        filter,
        brightness: 0,
        contrast: 0,
        ocrText: '',
        ocrBlocks: [],
        annotations: [],
        updatedAt: now,
      };
      await storage.upsertPage(page);
      createdPages.push(page);
    }

    const doc: Document = {
      id: docId,
      title: defaultTitle,
      folderId: folderId ?? null,
      tags: [],
      pageIds: createdPages.map((p) => p.id),
      ocrFullText: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
    };
    await storage.upsertDocument(doc);
    await enqueue('document', doc.id, 'upsert');
    await get().refreshLibrary();

    if (autoRunOcr ?? settings.autoOcr) {
      // Run OCR in background so navigation feels instant
      get()
        .runOcrForDocument(doc.id)
        .catch(() => {});
    }

    return doc;
  },

  appendPagesToDocument: async (docId, pages, autoRunOcr) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    const existing = await storage.listPages(docId);
    const settings = get().settings;
    const now = Date.now();
    const addedIds: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      const input = pages[i];
      const pageId = generateId();
      const origUri = await persistInputOrigin(pageId, input);
      const filter = input.filter ?? settings.defaultFilter;

      let procUri = input.processedUri || origUri;
      let w = input.width;
      let h = input.height;
      if (input.processedBytes) {
        procUri = await storage.saveImageBytes(
          `proc_${pageId}`,
          input.processedBytes,
          'jpg',
        );
      } else if (!input.processedUri) {
        const processed = await processImage({
          inputUri: origUri,
          outputId: `proc_${pageId}`,
          quad: input.quad,
          rotation: 0,
          filter,
          brightness: 0,
          contrast: 0,
        });
        procUri = processed.uri;
        w = processed.width;
        h = processed.height;
      }

      const page: Page = {
        id: pageId,
        documentId: docId,
        orderIndex: existing.length + i,
        originalUri: origUri,
        processedUri: procUri,
        width: w,
        height: h,
        quad: input.quad,
        rotation: 0,
        filter,
        brightness: 0,
        contrast: 0,
        ocrText: '',
        ocrBlocks: [],
        annotations: [],
        updatedAt: now,
      };
      await storage.upsertPage(page);
      addedIds.push(pageId);
    }

    await storage.upsertDocument({
      ...doc,
      pageIds: [...doc.pageIds, ...addedIds],
      updatedAt: now,
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'upsert');
    await get().refreshLibrary();

    if (autoRunOcr ?? settings.autoOcr) {
      for (const pid of addedIds) {
        get()
          .runOcrForDocument(docId, pid)
          .catch(() => {});
      }
    }
  },

  updateDocumentMeta: async (docId, patch) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    await storage.upsertDocument({
      ...doc,
      ...patch,
      updatedAt: Date.now(),
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'upsert');
    await get().refreshLibrary();
  },

  deleteDocument: async (docId) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    const pages = await storage.listPages(docId);
    for (const page of pages) {
      await storage.deleteImage(page.originalUri);
      if (page.processedUri !== page.originalUri) {
        await storage.deleteImage(page.processedUri);
      }
    }
    const now = Date.now();
    await storage.upsertDocument({
      ...doc,
      deletedAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'delete');
    await get().refreshLibrary();
  },

  reorderPages: async (docId, orderedPageIds) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    const pages = await storage.listPages(docId);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const now = Date.now();

    for (let i = 0; i < orderedPageIds.length; i++) {
      const p = byId.get(orderedPageIds[i]);
      if (p) {
        await storage.upsertPage({ ...p, orderIndex: i, updatedAt: now });
      }
    }
    const updatedPages = await storage.listPages(docId);
    await storage.upsertDocument({
      ...doc,
      pageIds: orderedPageIds,
      ocrFullText: combineOcrText(updatedPages),
      updatedAt: now,
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'upsert');
    await get().refreshLibrary();
  },

  deletePageFromDoc: async (docId, pageId) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    const page = await storage.getPage(pageId);
    if (page) {
      await storage.deleteImage(page.originalUri);
      if (page.processedUri !== page.originalUri) {
        await storage.deleteImage(page.processedUri);
      }
      await storage.deletePage(pageId);
    }
    const remaining = await storage.listPages(docId);
    const now = Date.now();
    for (let i = 0; i < remaining.length; i++) {
      await storage.upsertPage({ ...remaining[i], orderIndex: i });
    }
    await storage.upsertDocument({
      ...doc,
      pageIds: remaining.map((p) => p.id),
      ocrFullText: combineOcrText(remaining),
      updatedAt: now,
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'upsert');
    await get().refreshLibrary();
  },

  rotatePageQuick: async (docId, pageId) => {
    const page = await storage.getPage(pageId);
    if (!page) return;
    const nextRot = (((page.rotation + 90) % 360) as 0 | 90 | 180 | 270);
    await get().updatePageEdits(docId, pageId, {
      rotation: nextRot,
      reprocessImage: true,
    });
  },

  updatePageEdits: async (docId, pageId, edits) => {
    const page = await storage.getPage(pageId);
    if (!page) throw new Error('Page not found');
    const now = Date.now();

    const nextQuad = 'quad' in edits ? edits.quad : page.quad;
    const nextRotation = edits.rotation ?? page.rotation;
    const nextFilter = edits.filter ?? page.filter;
    const nextBrightness = edits.brightness ?? page.brightness;
    const nextContrast = edits.contrast ?? page.contrast;
    const nextAnnotations = edits.annotations ?? page.annotations;

    let processedUri = page.processedUri;
    let width = page.width;
    let height = page.height;

    const needsReprocess =
      edits.reprocessImage ||
      'quad' in edits ||
      edits.rotation !== undefined ||
      edits.filter !== undefined ||
      edits.brightness !== undefined ||
      edits.contrast !== undefined;

    if (needsReprocess) {
      const processed = await processImage({
        inputUri: page.originalUri,
        outputId: `proc_${page.id}_${now}`,
        quad: nextQuad,
        rotation: nextRotation,
        filter: nextFilter,
        brightness: nextBrightness,
        contrast: nextContrast,
      });
      if (
        page.processedUri &&
        page.processedUri !== page.originalUri &&
        page.processedUri !== processed.uri
      ) {
        await storage.deleteImage(page.processedUri);
      }
      processedUri = processed.uri;
      width = processed.width;
      height = processed.height;
    }

    const updated: Page = {
      ...page,
      quad: nextQuad,
      rotation: nextRotation,
      filter: nextFilter,
      brightness: nextBrightness,
      contrast: nextContrast,
      annotations: nextAnnotations,
      processedUri,
      width,
      height,
      updatedAt: now,
    };
    await storage.upsertPage(updated);

    const doc = await storage.getDocument(docId);
    if (doc) {
      await storage.upsertDocument({
        ...doc,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await enqueue('document', docId, 'upsert');
    }
    await get().refreshLibrary();
    return updated;
  },

  runOcrForDocument: async (docId, pageId) => {
    const doc = await storage.getDocument(docId);
    if (!doc) return;
    const pages = await storage.listPages(docId);
    const targets = pageId ? pages.filter((p) => p.id === pageId) : pages;

    for (const p of targets) {
      try {
        const res = await recognizeImageText(p.processedUri);
        await storage.upsertPage({
          ...p,
          ocrText: res.fullText,
          ocrBlocks: res.blocks,
          updatedAt: Date.now(),
        });
      } catch (err) {
        recordError('OCR', err);
        // Keep page intact even if OCR fails on a blank page
      }
    }

    const latestPages = await storage.listPages(docId);
    await storage.upsertDocument({
      ...doc,
      ocrFullText: combineOcrText(latestPages),
      updatedAt: Date.now(),
      syncStatus: 'pending',
    });
    await enqueue('document', docId, 'upsert');
    await get().refreshLibrary();
  },

  updatePageOcrText: async (docId, pageId, newText) => {
    const page = await storage.getPage(pageId);
    if (!page) return;
    await storage.upsertPage({
      ...page,
      ocrText: newText,
      updatedAt: Date.now(),
    });
    const doc = await storage.getDocument(docId);
    if (doc) {
      const pages = await storage.listPages(docId);
      await storage.upsertDocument({
        ...doc,
        ocrFullText: combineOcrText(pages),
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      await enqueue('document', docId, 'upsert');
    }
    await get().refreshLibrary();
  },

  saveNewSignature: async ({ name, svgPathData, pngBytes, width, height }) => {
    const id = generateId();
    const pngUri = await storage.saveImageBytes(`sig_${id}`, pngBytes, 'png');
    const sig: SavedSignature = {
      id,
      name: name.trim() || 'Signature',
      svgPathData,
      pngUri,
      width,
      height,
      createdAt: Date.now(),
    };
    await storage.upsertSignature(sig);
    await get().refreshLibrary();
    return sig;
  },

  deleteSignature: async (id) => {
    const list = await storage.listSignatures();
    const target = list.find((s) => s.id === id);
    if (target) {
      await storage.deleteImage(target.pngUri);
      await storage.deleteSignature(id);
      await get().refreshLibrary();
    }
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    await storage.saveSettings(next);
    set({ settings: next });
  },

  triggerSync: async (accessTokenOverride?: string) => {
    const token = accessTokenOverride || loadStoredToken()?.accessToken;
    if (!token) {
      set({ syncState: 'offline', lastSyncError: 'Not signed in to Google Drive' });
      return null;
    }

    set({ syncState: 'syncing', lastSyncError: null });
    try {
      const drive = new FetchDriveClient(token);
      const engine = new SyncEngine(storage, drive, {
        buildVisiblePdf: async (doc, pages) =>
          buildDocumentPdfBytes(doc, pages, {
            format: 'pdf',
            pageSize: get().settings.defaultPageSize,
            quality: get().settings.defaultQuality,
            includeOcrLayer: true,
          }),
        reprocessPage: async (page) => {
          const res = await processImage({
            inputUri: page.originalUri,
            outputId: `proc_${page.id}`,
            quad: page.quad,
            rotation: page.rotation,
            filter: page.filter,
            brightness: page.brightness,
            contrast: page.contrast,
          });
          return {
            processedUri: res.uri,
            width: res.width,
            height: res.height,
          };
        },
        generateId,
      });

      const res = await engine.sync();
      await get().refreshLibrary();
      if (res.errors.length > 0) {
        recordError('DriveSync', res.errors[0]);
      }
      set({
        syncState: res.errors.length > 0 ? 'error' : 'idle',
        lastSyncError: res.errors[0] ?? null,
      });
      return res;
    } catch (err) {
      recordError('DriveSync', err);
      set({
        syncState: 'error',
        lastSyncError: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  clearLocalCache: async () => {
    if (!storage.clearCache) return 0;
    const freed = await storage.clearCache();
    await get().refreshLibrary();
    return freed;
  },

  eraseAllData: async () => {
    saveStoredToken(null);
    await storage.eraseAllData?.();
    clearErrorLog();
    set({
      folders: [],
      documents: [],
      pagesByDoc: {},
      signatures: [],
      settings: DEFAULT_APP_SETTINGS,
      searchQuery: '',
      selectedFolderId: 'all',
      selectedTag: null,
      syncState: 'idle',
      lastSyncError: null,
      pendingSyncCount: 0,
    });
  },
}));
