import { requireOptionalNativeModule } from 'expo';
import type { FilterPreset, OcrResult, Quad } from '../../../src/types/models';

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
  composeIdCard(
    frontUri: string,
    backUri: string,
    outputUri: string,
  ): Promise<ScannedPageNative>;
}

const NativeModule =
  requireOptionalNativeModule<CScannerMlkitNativeInterface>('CScannerMlkit');

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
  const pageLimit = options?.pageLimit ?? 24;
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
