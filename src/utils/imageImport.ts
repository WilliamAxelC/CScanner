import * as ImagePicker from 'expo-image-picker';
import { storage } from '../storage';

export interface ImportedImage {
  uri: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function pickImagesFromDevice(
  allowMultiple = true,
): Promise<ImportedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: allowMultiple,
    quality: 0.95,
  });

  if (result.canceled || !result.assets?.length) {
    return [];
  }

  const out: ImportedImage[] = [];
  for (const asset of result.assets) {
    const bytes = await storage.readImageBytes(asset.uri);
    out.push({
      uri: asset.uri,
      bytes,
      width: asset.width || 1200,
      height: asset.height || 1600,
    });
  }
  return out;
}
