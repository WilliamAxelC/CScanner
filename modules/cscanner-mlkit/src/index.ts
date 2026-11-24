import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type {
  FilterPreset,
  OcrResult,
  Quad,
  RedactAnnotation,
} from '../../../src/types/models';

export interface ApkArchiveInfo {
  packageName: string;
  versionCode: number;
  versionName: string;
}

export interface UpdateNativeApi {
  sha256File(uri: string): Promise<string>;
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): boolean;
  inspectApk(uri: string): ApkArchiveInfo | null;
  installApk(uri: string): boolean;
}

export interface ScannedPageNative {
  uri: string;
  width: number;
  height: number;
}

export interface ScanDocumentResult {
  cancelled: boolean;
  pages: ScannedPageNative[];
}

export interface ProcessImageNativeParams {
  inputUri: string;
  outputUri: string;
  quad?: Quad;
  rotation: number;
  filter: FilterPreset;
  brightness: number;
  contrast: number;
  quality?: number;
}

export interface RedactImageNativeParams {
  inputUri: string;
  outputUri: string;
  redactions: RedactAnnotation[];
  maxDim: number;
  quality: number;
}

interface CScannerMlkitNativeInterface {
  scanDocument(
    pageLimit: number,
    galleryImportAllowed: boolean,
    scannerMode: string,
  ): Promise<ScanDocumentResult>;
  recognizeText(imageUri: string): Promise<OcrResult>;
  processImage(
    inputUri: string,
    outputUri: string,
    quadCoords: number[] | null,
    rotation: number,
    filter: string,
    brightness: number,
    contrast: number,
    quality: number,
  ): Promise<ScannedPageNative>;
  redactImage(
    inputUri: string,
    outputUri: string,
    redactRects: number[],
    redactColors: string[],
    maxDim: number,
    quality: number,
  ): Promise<ScannedPageNative>;
  composeIdCard(
    frontUri: string,
    backUri: string,
    outputUri: string,
  ): Promise<ScannedPageNative>;
  sha256File(uri: string): Promise<string>;
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): boolean;
  inspectApk(uri: string): ApkArchiveInfo | null;
  installApk(uri: string): boolean;
}

const NativeModule =
  requireOptionalNativeModule<CScannerMlkitNativeInterface>('CScannerMlkit');

export function getNativeUpdater(): UpdateNativeApi | null {
  if (Platform.OS !== 'android' || !NativeModule || typeof NativeModule.installApk !== 'function') {
    return null;
  }
  return NativeModule;
}

export function isNativeScannerAvailable(): boolean {
  return NativeModule !== null;
}

export async function scanDocumentNative(options?: {
  pageLimit?: number;
  galleryImportAllowed?: boolean;
  scannerMode?: 'FULL' | 'BASE' | 'BASE_WITH_FILTER';
}): Promise<ScanDocumentResult> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  const pageLimit = Math.max(1, Math.min(50, options?.pageLimit ?? 24));
  const galleryImportAllowed = options?.galleryImportAllowed ?? true;
  const scannerMode = options?.scannerMode ?? 'FULL';
  return NativeModule.scanDocument(pageLimit, galleryImportAllowed, scannerMode);
}

export async function recognizeTextNative(imageUri: string): Promise<OcrResult> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  return NativeModule.recognizeText(imageUri);
}

export async function processImageNative(
  params: ProcessImageNativeParams,
): Promise<ScannedPageNative> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  const flatQuad =
    params.quad && params.quad.length === 4
      ? [
          params.quad[0].x,
          params.quad[0].y,
          params.quad[1].x,
          params.quad[1].y,
          params.quad[2].x,
          params.quad[2].y,
          params.quad[3].x,
          params.quad[3].y,
        ]
      : null;

  return NativeModule.processImage(
    params.inputUri,
    params.outputUri,
    flatQuad,
    params.rotation,
    params.filter,
    params.brightness,
    params.contrast,
    params.quality ?? 88,
  );
}

export async function redactImageNative(
  params: RedactImageNativeParams,
): Promise<ScannedPageNative> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  const flatRects: number[] = [];
  const colors: string[] = [];
  for (const r of params.redactions) {
    flatRects.push(r.x, r.y, r.width, r.height);
    colors.push(r.color);
  }
  return NativeModule.redactImage(
    params.inputUri,
    params.outputUri,
    flatRects,
    colors,
    params.maxDim,
    params.quality,
  );
}

export async function composeIdCardNative(params: {
  frontUri: string;
  backUri: string;
  outputUri: string;
}): Promise<ScannedPageNative> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  return NativeModule.composeIdCard(
    params.frontUri,
    params.backUri,
    params.outputUri,
  );
}
