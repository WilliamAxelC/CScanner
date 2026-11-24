import { generateId } from '../../utils/ids';
import {
  assertValidMimeType,
  escapeDriveQueryValue,
  sanitizeErrorMessage,
} from '../../utils/security';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
}

export interface DriveClient {
  ensureFolder(name: string, parentId?: string): Promise<string>;
  listFiles(query: string): Promise<DriveFile[]>;
  uploadMultipart(
    metadata: { name: string; mimeType: string; parents?: string[] },
    bytes: Uint8Array,
    existingFileId?: string,
  ): Promise<DriveFile>;
  downloadBytes(fileId: string): Promise<Uint8Array>;
  trashFile(fileId: string): Promise<void>;
}

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export { escapeDriveQueryValue };

function concatUint8(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export class FetchDriveClient implements DriveClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Google Drive API error ${res.status}: ${sanitizeErrorMessage(body || res.statusText, 140)}`,
      );
    }
    return res;
  }

  async listFiles(query: string): Promise<DriveFile[]> {
    const all: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime)',
        pageSize: '200',
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await this.request(`${DRIVE_FILES_URL}?${params.toString()}`);
      const json = (await res.json()) as {
        files?: DriveFile[];
        nextPageToken?: string;
      };
      if (json.files) all.push(...json.files);
      pageToken = json.nextPageToken;
    } while (pageToken);

    return all;
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const escaped = escapeDriveQueryValue(name);
    const parentClause = parentId
      ? `'${escapeDriveQueryValue(parentId)}' in parents`
      : `'root' in parents`;
    const query = `name = '${escaped}' and mimeType = '${FOLDER_MIME}' and ${parentClause} and trashed = false`;

    const existing = await this.listFiles(query);
    if (existing.length > 0) {
      return existing[0].id;
    }

    const metadata: Record<string, unknown> = {
      name,
      mimeType: FOLDER_MIME,
    };
    if (parentId) metadata.parents = [parentId];

    const res = await this.request(DRIVE_FILES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    const created = (await res.json()) as DriveFile;
    return created.id;
  }

  async uploadMultipart(
    metadata: { name: string; mimeType: string; parents?: string[] },
    bytes: Uint8Array,
    existingFileId?: string,
  ): Promise<DriveFile> {
    const validMime = assertValidMimeType(metadata.mimeType);
    const boundary = `cscanner_${generateId().replace(/-/g, '')}`;
    const encoder = new TextEncoder();

    const cleanMeta: Record<string, unknown> = {
      name: metadata.name.replace(/[\r\n\0]/g, '_'),
      mimeType: validMime,
    };
    // Drive PATCH does not allow `parents` inside metadata body
    if (!existingFileId && metadata.parents?.length) {
      cleanMeta.parents = metadata.parents;
    }

    const head = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(cleanMeta)}\r\n--${boundary}\r\nContent-Type: ${validMime}\r\n\r\n`,
    );
    const tail = encoder.encode(`\r\n--${boundary}--`);
    const bodyBytes = concatUint8([head, bytes, tail]);

    const url = existingFileId
      ? `${DRIVE_UPLOAD_URL}/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime`;

    const res = await this.request(url, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: bodyBytes as unknown as BodyInit,
    });
    return (await res.json()) as DriveFile;
  }

  async downloadBytes(fileId: string): Promise<Uint8Array> {
    const res = await this.request(
      `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`,
    );
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async trashFile(fileId: string): Promise<void> {
    await this.request(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }
}
