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
  scanDocument(options: {
    pageLimit?: number;
    galleryImportAllowed?: boolean;
    scannerMode?: 'FULL' | 'BASE' | 'BASE_WITH_FILTER';
  }): Promise<ScanDocumentResult>;
  recognizeText(imageUri: string): Promise<OcrResult>;
  processImage(params: ProcessImageNativeParams): Promise<ScannedPageNative>;
  composeIdCard(params: {
    frontUri: string;
    backUri: string;
    outputUri: string;
  }): Promise<ScannedPageNative>;
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
  return NativeModule.scanDocument(options ?? {});
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
  return NativeModule.processImage(params);
}

export async function composeIdCardNative(params: {
  frontUri: string;
  backUri: string;
  outputUri: string;
}): Promise<ScannedPageNative> {
  if (!NativeModule) {
    throw new Error('CScannerMlkit native module is not available on this build');
  }
  return NativeModule.composeIdCard(params);
}
