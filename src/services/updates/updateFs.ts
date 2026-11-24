export interface UpdateDownloadTask {
  downloadAsync(): Promise<{ status: number } | undefined>;
  pauseAsync(): Promise<unknown>;
}

export interface UpdateFsApi {
  cacheDirectory: string | null;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  readDirectoryAsync(uri: string): Promise<string[]>;
  createDownloadResumable(
    url: string,
    fileUri: string,
    options: Record<string, unknown>,
    callback: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ): UpdateDownloadTask;
}

/** Web / Node default: in-app native APK download & FileProvider installer are Android-only. */
export function getUpdateFs(): UpdateFsApi | null {
  return null;
}
