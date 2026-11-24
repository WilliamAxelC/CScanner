import { isNativeScannerAvailable } from './index';

export type {
  ProcessImageNativeParams,
  ScanDocumentResult,
  ScannedPageNative,
} from './index';
export { isNativeScannerAvailable };

export async function scanDocumentNative() {
  throw new Error('Native ML Kit scanner is not available on web');
}

export async function recognizeTextNative(_imageUri: string) {
  throw new Error('Native ML Kit OCR is not available on web');
}

export async function processImageNative() {
  throw new Error('Native image processor is not available on web');
}

export async function composeIdCardNative() {
  throw new Error('Native ID card composer is not available on web');
}
