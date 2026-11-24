import type { StorageAdapter } from '../../storage/types';
import type { Document, Folder, Page } from '../../types/models';
import type { DriveClient } from './driveApi';

export interface RemotePageManifest {
  id: string;
  orderIndex: number;
  width: number;
  height: number;
  quad?: Page['quad'];
  rotation: Page['rotation'];
  filter: Page['filter'];
  brightness: number;
  contrast: number;
  ocrText: string;
  ocrBlocks: Page['ocrBlocks'];
  annotations: Page['annotations'];
  driveImageFileId?: string;
  updatedAt: number;
}

export interface RemoteDocumentManifest {
  version: 1;
  id: string;
  title: string;
  folderId: string | null;
  folderName?: string | null;
  tags: string[];
  pageIds: string[];
  ocrFullText: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  driveFileId?: string;
  pages: RemotePageManifest[];
}

export interface SyncResult {
  pushedDocs: number;
  pulledDocs: number;
  conflicts: number;
  errors: string[];
  syncedAt: number;
}

export interface SyncEngineDeps {
  buildVisiblePdf: (doc: Document, pages: Page[]) => Promise<Uint8Array>;
  reprocessPage?: (
    page: Page,
  ) => Promise<{ processedUri: string; width: number; height: number }>;
  generateId?: () => string;
}

function sanitizePdfFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ');
  return `${cleaned || 'Untitled Scan'}.pdf`;
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SyncEngine {
  constructor(
    private storage: StorageAdapter,
    private drive: DriveClient,
    private deps: SyncEngineDeps,
  ) {}

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      pushedDocs: 0,
      pulledDocs: 0,
      conflicts: 0,
      errors: [],
      syncedAt: Date.now(),
    };

    const settings = await this.storage.getSettings();
    const rootFolderId =
      settings.driveRootFolderId || (await this.drive.ensureFolder('CScanner'));
    const metaFolderId =
      settings.driveMetaFolderId ||
      (await this.drive.ensureFolder('.cscanner-meta', rootFolderId));

    if (
      settings.driveRootFolderId !== rootFolderId ||
      settings.driveMetaFolderId !== metaFolderId
    ) {
      await this.storage.saveSettings({
        ...settings,
        driveRootFolderId: rootFolderId,
        driveMetaFolderId: metaFolderId,
      });
    }

    // 1. Push phase
    await this.pushPending(rootFolderId, metaFolderId, result);

    // 2. Pull phase
    await this.pullRemote(metaFolderId, result);

    const latestSettings = await this.storage.getSettings();
    await this.storage.saveSettings({
      ...latestSettings,
      lastSyncAt: result.syncedAt,
    });

    return result;
  }

  private async ensureDriveFolderFor(
    folderId: string | null,
    rootFolderId: string,
  ): Promise<{ driveParentId: string; folderName: string | null }> {
    if (!folderId) {
      return { driveParentId: rootFolderId, folderName: null };
    }
    const folders = await this.storage.listFolders({ includeDeleted: true });
    const folder = folders.find((f) => f.id === folderId);
    if (!folder || folder.deletedAt !== null) {
      return { driveParentId: rootFolderId, folderName: null };
    }
    if (folder.driveFolderId) {
      return { driveParentId: folder.driveFolderId, folderName: folder.name };
    }
    const driveId = await this.drive.ensureFolder(folder.name, rootFolderId);
    await this.storage.upsertFolder({ ...folder, driveFolderId: driveId });
    return { driveParentId: driveId, folderName: folder.name };
  }

  private async pushPending(
    rootFolderId: string,
    metaFolderId: string,
    result: SyncResult,
  ): Promise<void> {
    const queue = await this.storage.listSyncQueue();
    const encoder = new TextEncoder();

    for (const op of queue) {
      try {
        if (op.entityType === 'folder') {
          const folders = await this.storage.listFolders({
            includeDeleted: true,
          });
          const folder = folders.find((f) => f.id === op.entityId);
          if (folder) {
            if (folder.deletedAt !== null) {
              if (folder.driveFolderId) {
                await this.drive.trashFile(folder.driveFolderId).catch(() => {});
              }
            } else {
              const driveId = await this.drive.ensureFolder(
                folder.name,
                rootFolderId,
              );
              await this.storage.upsertFolder({
                ...folder,
                driveFolderId: driveId,
              });
            }
          }
          await this.storage.removeSyncOp(op.id);
          continue;
        }

        if (op.entityType === 'document') {
          const doc = await this.storage.getDocument(op.entityId);
          if (!doc) {
            await this.storage.removeSyncOp(op.id);
            continue;
          }

          if (doc.deletedAt !== null) {
            if (doc.driveFileId) {
              await this.drive.trashFile(doc.driveFileId).catch(() => {});
            }
            if (doc.driveMetaFileId) {
              await this.drive.trashFile(doc.driveMetaFileId).catch(() => {});
            }
            await this.storage.upsertDocument({
              ...doc,
              syncStatus: 'synced',
              lastSyncedAt: Date.now(),
            });
            await this.storage.removeSyncOp(op.id);
            continue;
          }

          const pages = await this.storage.listPages(doc.id);
          const orderedPages = [...pages].sort(
            (a, b) => a.orderIndex - b.orderIndex,
          );

          // Upload any original images missing in Drive
          const updatedPages: Page[] = [];
          for (const page of orderedPages) {
            if (!page.driveImageFileId) {
              const imgBytes = await this.storage.readImageBytes(
                page.originalUri,
              );
              const uploadedImg = await this.drive.uploadMultipart(
                {
                  name: `page-${page.id}.jpg`,
                  mimeType: 'image/jpeg',
                  parents: [metaFolderId],
                },
                imgBytes,
              );
              const nextPage: Page = {
                ...page,
                driveImageFileId: uploadedImg.id,
              };
              await this.storage.upsertPage(nextPage);
              updatedPages.push(nextPage);
            } else {
              updatedPages.push(page);
            }
          }

          const { driveParentId, folderName } =
            await this.ensureDriveFolderFor(doc.folderId, rootFolderId);

          // Generate & upload visible PDF to My Drive/CScanner/<Folder>/
          let driveFileId = doc.driveFileId;
          if (updatedPages.length > 0) {
            const pdfBytes = await this.deps.buildVisiblePdf(doc, updatedPages);
            const uploadedPdf = await this.drive.uploadMultipart(
              {
                name: sanitizePdfFilename(doc.title),
                mimeType: 'application/pdf',
                parents: [driveParentId],
              },
              pdfBytes,
              driveFileId,
            );
            driveFileId = uploadedPdf.id;
          }

          // Build & upload lossless metadata manifest
          const manifest: RemoteDocumentManifest = {
            version: 1,
            id: doc.id,
            title: doc.title,
            folderId: doc.folderId,
            folderName,
            tags: doc.tags,
            pageIds: updatedPages.map((p) => p.id),
            ocrFullText: doc.ocrFullText,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            deletedAt: doc.deletedAt,
            driveFileId,
            pages: updatedPages.map((p) => ({
              id: p.id,
              orderIndex: p.orderIndex,
              width: p.width,
              height: p.height,
              quad: p.quad,
              rotation: p.rotation,
              filter: p.filter,
              brightness: p.brightness,
              contrast: p.contrast,
              ocrText: p.ocrText,
              ocrBlocks: p.ocrBlocks,
              annotations: p.annotations,
              driveImageFileId: p.driveImageFileId,
              updatedAt: p.updatedAt,
            })),
          };

          const manifestBytes = encoder.encode(JSON.stringify(manifest));
          let metaId = doc.driveMetaFileId;
          if (!metaId) {
            const existingMeta = await this.drive.listFiles(
              `name = 'doc-${doc.id}.json' and '${metaFolderId}' in parents and trashed = false`,
            );
            if (existingMeta.length > 0) metaId = existingMeta[0].id;
          }

          const uploadedMeta = await this.drive.uploadMultipart(
            {
              name: `doc-${doc.id}.json`,
              mimeType: 'application/json',
              parents: [metaFolderId],
            },
            manifestBytes,
            metaId,
          );

          await this.storage.upsertDocument({
            ...doc,
            driveFileId,
            driveMetaFileId: uploadedMeta.id,
            syncStatus: 'synced',
            lastSyncedAt: Date.now(),
          });

          await this.storage.removeSyncOp(op.id);
          result.pushedDocs++;
        } else {
          await this.storage.removeSyncOp(op.id);
        }
      } catch (err) {
        await this.storage.incrementSyncAttempt(op.id);
        result.errors.push(
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  private async pullRemote(
    metaFolderId: string,
    result: SyncResult,
  ): Promise<void> {
    const decoder = new TextDecoder();
    const genId = this.deps.generateId ?? defaultId;

    const remoteFiles = await this.drive.listFiles(
      `'${metaFolderId}' in parents and mimeType = 'application/json' and trashed = false`,
    );
    const docManifestFiles = remoteFiles.filter((f) =>
      f.name.startsWith('doc-') && f.name.endsWith('.json'),
    );

    const localDocs = await this.storage.listDocuments({ includeDeleted: true });
    const localDocMap = new Map<string, Document>(
      localDocs.map((d) => [d.id, d]),
    );
    const localFolders = await this.storage.listFolders({
      includeDeleted: true,
    });
    const folderMap = new Map<string, Folder>(
      localFolders.map((f) => [f.id, f]),
    );

    for (const file of docManifestFiles) {
      try {
        const docIdFromName = file.name.slice(4, -5);
        const existingLocal = localDocMap.get(docIdFromName);
        const remoteModMs = file.modifiedTime
          ? Date.parse(file.modifiedTime)
          : Infinity;

        if (
          existingLocal &&
          existingLocal.syncStatus === 'synced' &&
          existingLocal.lastSyncedAt &&
          Number.isFinite(remoteModMs) &&
          remoteModMs <= existingLocal.lastSyncedAt
        ) {
          continue;
        }

        const rawBytes = await this.drive.downloadBytes(file.id);
        const manifest = JSON.parse(
          decoder.decode(rawBytes),
        ) as RemoteDocumentManifest;

        // Ensure remote folder exists locally if referenced
        if (
          manifest.folderId &&
          manifest.folderName &&
          !folderMap.has(manifest.folderId)
        ) {
          const newFolder: Folder = {
            id: manifest.folderId,
            name: manifest.folderName,
            createdAt: manifest.createdAt,
            updatedAt: manifest.updatedAt,
            deletedAt: null,
          };
          await this.storage.upsertFolder(newFolder);
          folderMap.set(newFolder.id, newFolder);
        }

        if (!existingLocal) {
          await this.materializeRemoteDoc(manifest, file.id, manifest.id, false);
          result.pulledDocs++;
          continue;
        }

        if (
          existingLocal.syncStatus === 'synced' &&
          manifest.updatedAt > existingLocal.updatedAt
        ) {
          await this.materializeRemoteDoc(manifest, file.id, manifest.id, false);
          result.pulledDocs++;
          continue;
        }

        // True concurrent offline conflict: local has pending edits AND remote changed after our last sync
        if (
          existingLocal.syncStatus === 'pending' &&
          manifest.updatedAt > (existingLocal.lastSyncedAt ?? 0)
        ) {
          const conflictDocId = genId();
          const conflictManifest: RemoteDocumentManifest = {
            ...manifest,
            id: conflictDocId,
            title: `${manifest.title} (Conflict)`,
            pages: manifest.pages.map((p) => ({ ...p, id: genId() })),
          };
          conflictManifest.pageIds = conflictManifest.pages.map((p) => p.id);
          await this.materializeRemoteDoc(
            conflictManifest,
            undefined,
            conflictDocId,
            true,
          );
          result.conflicts++;
        }
      } catch (err) {
        result.errors.push(
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  private async materializeRemoteDoc(
    manifest: RemoteDocumentManifest,
    driveMetaFileId: string | undefined,
    targetDocId: string,
    asConflictCopy: boolean,
  ): Promise<void> {
    const existingPages = await this.storage.listPages(targetDocId);
    const existingById = new Map(existingPages.map((p) => [p.id, p]));
    const nextPageIds: string[] = [];

    for (const rp of manifest.pages) {
      const existingPage = existingById.get(rp.id);
      let originalUri = existingPage?.originalUri ?? '';

      if (!originalUri && rp.driveImageFileId) {
        const imgBytes = await this.drive.downloadBytes(rp.driveImageFileId);
        originalUri = await this.storage.saveImageBytes(
          `orig_${rp.id}`,
          imgBytes,
          'jpg',
        );
      }

      let processedUri = existingPage?.processedUri || originalUri;
      let width = rp.width;
      let height = rp.height;

      const draftPage: Page = {
        id: rp.id,
        documentId: targetDocId,
        orderIndex: rp.orderIndex,
        originalUri,
        processedUri,
        width,
        height,
        quad: rp.quad,
        rotation: rp.rotation,
        filter: rp.filter,
        brightness: rp.brightness,
        contrast: rp.contrast,
        ocrText: rp.ocrText,
        ocrBlocks: rp.ocrBlocks,
        annotations: rp.annotations,
        driveImageFileId: asConflictCopy ? undefined : rp.driveImageFileId,
        updatedAt: rp.updatedAt,
      };

      if (this.deps.reprocessPage && originalUri) {
        const reprocessed = await this.deps.reprocessPage(draftPage);
        draftPage.processedUri = reprocessed.processedUri;
        draftPage.width = reprocessed.width;
        draftPage.height = reprocessed.height;
      }

      await this.storage.upsertPage(draftPage);
      nextPageIds.push(draftPage.id);
    }

    // Remove pages deleted remotely
    for (const oldPage of existingPages) {
      if (!nextPageIds.includes(oldPage.id)) {
        await this.storage.deletePage(oldPage.id);
      }
    }

    const doc: Document = {
      id: targetDocId,
      title: manifest.title,
      folderId: manifest.folderId,
      tags: manifest.tags,
      pageIds: nextPageIds,
      ocrFullText: manifest.ocrFullText,
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      deletedAt: manifest.deletedAt,
      syncStatus: asConflictCopy ? 'conflict' : 'synced',
      driveFileId: asConflictCopy ? undefined : manifest.driveFileId,
      driveMetaFileId: asConflictCopy ? undefined : driveMetaFileId,
      lastSyncedAt: asConflictCopy ? undefined : Date.now(),
    };

    await this.storage.upsertDocument(doc);
  }
}
