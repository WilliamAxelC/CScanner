import * as FileSystem from 'expo-file-system/legacy';
import type { UpdateFsApi } from './updateFs';

const nativeFs: UpdateFsApi = {
  get cacheDirectory() {
    return FileSystem.cacheDirectory;
  },
  makeDirectoryAsync: (uri, options) =>
    FileSystem.makeDirectoryAsync(uri, options),
  getInfoAsync: (uri) =>
    FileSystem.getInfoAsync(uri) as Promise<{ exists: boolean; size?: number }>,
  deleteAsync: (uri, options) => FileSystem.deleteAsync(uri, options),
  readDirectoryAsync: (uri) => FileSystem.readDirectoryAsync(uri),
  createDownloadResumable: (url, fileUri, options, callback) =>
    FileSystem.createDownloadResumable(url, fileUri, options, callback),
};

export function getUpdateFs(): UpdateFsApi | null {
  return nativeFs;
}
