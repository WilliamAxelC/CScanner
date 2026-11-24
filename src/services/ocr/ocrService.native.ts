import { isNativeScannerAvailable, recognizeTextNative } from 'cscanner-mlkit';
import type { OcrResult } from '../../types/models';

export async function recognizeImageText(imageUri: string): Promise<OcrResult> {
  if (!isNativeScannerAvailable()) {
    return {
      fullText: '',
      blocks: [],
    };
  }
  return recognizeTextNative(imageUri);
}
