export interface Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export type Quad = [Point, Point, Point, Point]; // [TL, TR, BR, BL]

export type FilterPreset = 'original' | 'magic' | 'bw' | 'grayscale' | 'lighten';

export type PageSizePreset = 'auto' | 'a4' | 'letter';

export type QualityPreset = 'low' | 'medium' | 'high';

export type ThemeMode = 'system' | 'light' | 'dark';

export type FontScalePreset = 0.9 | 1.0 | 1.15 | 1.3;

export interface OcrBlock {
  text: string;
  x: number; // normalized 0..1
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  fullText: string;
  blocks: OcrBlock[];
}

export interface SignatureAnnotation {
  id: string;
  type: 'signature';
  signatureId: string;
  x: number; // normalized 0..1
  y: number;
  width: number;
  height: number;
}

export interface WatermarkAnnotation {
  id: string;
  type: 'watermark';
  text: string;
  opacity: number; // 0.05..0.8
  angle: number; // degrees, e.g. -35
  tiled: boolean;
  color: string;
}

export interface RedactAnnotation {
  id: string;
  type: 'redact';
  x: number; // normalized 0..1
  y: number;
  width: number;
  height: number;
  color: '#000000' | '#FFFFFF';
}

export type Annotation =
  | SignatureAnnotation
  | WatermarkAnnotation
  | RedactAnnotation;

export interface SavedSignature {
  id: string;
  name: string;
  svgPathData: string;
  pngUri: string;
  width: number;
  height: number;
  createdAt: number;
}

export interface Page {
  id: string;
  documentId: string;
  orderIndex: number;
  originalUri: string;
  processedUri: string;
  width: number;
  height: number;
  quad?: Quad;
  rotation: 0 | 90 | 180 | 270;
  filter: FilterPreset;
  brightness: number; // -100..100
  contrast: number; // -100..100
  ocrText: string;
  ocrBlocks: OcrBlock[];
  annotations: Annotation[];
  driveImageFileId?: string;
  updatedAt: number;
}

export type SyncStatus = 'pending' | 'synced' | 'conflict';

export interface Document {
  id: string;
  title: string;
  folderId: string | null;
  tags: string[];
  pageIds: string[];
  ocrFullText: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: SyncStatus;
  driveFileId?: string;
  driveMetaFileId?: string;
  lastSyncedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  driveFolderId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type SyncEntityType = 'document' | 'folder' | 'signature';
export type SyncAction = 'upsert' | 'delete';

export interface SyncOperation {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payloadJson: string;
  createdAt: number;
  attempts: number;
}

export interface ExportOptions {
  format: 'pdf' | 'jpeg';
  pageSize: PageSizePreset;
  quality: QualityPreset;
  includeOcrLayer: boolean;
  password?: string;
}

export interface AppSettings {
  theme: ThemeMode;
  defaultFilter: FilterPreset;
  defaultPageSize: PageSizePreset;
  defaultQuality: QualityPreset;
  autoOcr: boolean;
  fontScale: FontScalePreset;
  highContrast: boolean;
  reduceMotion: boolean;
  confirmBeforeDelete: boolean;
  autoCheckUpdates: boolean;
  updateLastCheckedAt?: number;
  updateDismissedVersionCode?: number;
  updateCachedManifestJson?: string;
  pendingUpdateVersionCode?: number;
  lastSyncAt?: number;
  googleEmail?: string;
  driveRootFolderId?: string;
  driveMetaFolderId?: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  defaultFilter: 'magic',
  defaultPageSize: 'a4',
  defaultQuality: 'medium',
  autoOcr: true,
  fontScale: 1.0,
  highContrast: false,
  reduceMotion: false,
  confirmBeforeDelete: true,
  autoCheckUpdates: true,
};
