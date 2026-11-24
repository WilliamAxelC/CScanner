import { Directory, File, Paths } from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import {
  composeIdCardNative,
  isNativeScannerAvailable,
  processImageNative,
} from 'cscanner-mlkit';
import type { FilterPreset, Quad } from '../../types/models';
import { generateId } from '../../utils/ids';
import { DEFAULT_QUAD } from './autoEdge';

export interface ProcessImageParams {
  inputUri: string;
  outputId: string;
  quad?: Quad;
  rotation: 0 | 90 | 180 | 270;
  filter: FilterPreset;
  brightness: number;
  contrast: number;
  quality?: number;
}

export interface ProcessedImageResult {
  uri: string;
  width: number;
  height: number;
}

function getManagedOutputUri(id: string): string {
  const dir = new Directory(Paths.document, 'cscanner', 'images');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return new File(dir, `${id}.jpg`).uri;
}

export async function autoDetectQuadFromUri(_uri: string): Promise<Quad> {
  // On Android, ML Kit Document Scanner returns already auto-cropped pages; manual re-crop starts cleanly
  return DEFAULT_QUAD;
}

export async function processImage(
  params: ProcessImageParams,
): Promise<ProcessedImageResult> {
  const outputUri = getManagedOutputUri(params.outputId);

  if (isNativeScannerAvailable()) {
    return processImageNative({
      inputUri: params.inputUri,
      outputUri,
      quad: params.quad,
      rotation: params.rotation,
      filter: params.filter,
      brightness: params.brightness,
      contrast: params.contrast,
      quality: params.quality ?? 88,
    });
  }

  // Safe fallback via expo-image-manipulator if running in a client without custom native module
  const actions: Array<{ rotate: number }> = [];
  if (params.rotation !== 0) {
    actions.push({ rotate: params.rotation });
  }
  const res = await manipulateAsync(params.inputUri, actions, {
    compress: (params.quality ?? 88) / 100,
    format: SaveFormat.JPEG,
  });
  const bytes = await new File(res.uri).bytes();
  const outFile = new File(outputUri);
  outFile.create({ intermediates: true, overwrite: true });
  await outFile.write(bytes);
  return { uri: outFile.uri, width: res.width, height: res.height };
}

export async function composeIdCard(params: {
  frontUri: string;
  backUri: string;
  outputId?: string;
}): Promise<ProcessedImageResult> {
  const outputUri = getManagedOutputUri(
    params.outputId || `idcard_${generateId()}`,
  );
  if (isNativeScannerAvailable()) {
    return composeIdCardNative({
      frontUri: params.frontUri,
      backUri: params.backUri,
      outputUri,
    });
  }
  // Fallback: save front image if native module unavailable
  const bytes = await new File(params.frontUri).bytes();
  const outFile = new File(outputUri);
  outFile.create({ intermediates: true, overwrite: true });
  await outFile.write(bytes);
  return { uri: outFile.uri, width: 1240, height: 1754 };
}

export async function reencodeJpegForExport(
  uri: string,
  maxWidth: number,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const res = await manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    {
      compress: quality,
      format: SaveFormat.JPEG,
    },
  );
  const bytes = await new File(res.uri).bytes();
  return { bytes, width: res.width, height: res.height };
}
