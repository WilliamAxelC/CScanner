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

export function isNativeScannerAvailable(): boolean {
  return false;
}

export async function scanDocumentNative(): Promise<ScanDocumentResult> {
  throw new Error('Native ML Kit scanner is not available on web');
}

export async function recognizeTextNative(_imageUri: string): Promise<OcrResult> {
  throw new Error('Native ML Kit OCR is not available on web');
}

export async function processImageNative(
  _params: ProcessImageNativeParams,
): Promise<ScannedPageNative> {
  throw new Error('Native image processor is not available on web');
}

export async function composeIdCardNative(): Promise<ScannedPageNative> {
  throw new Error('Native ID card composer is not available on web');
}
