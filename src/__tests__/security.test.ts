import { describe, expect, it } from 'vitest';
import {
  assertSafeAssetId,
  assertValidMimeType,
  escapeDriveQueryValue,
  getPagesForDoc,
  isSafeLocalFetchUri,
  safeJsonParse,
  sanitizeErrorMessage,
  validateRemoteManifest,
} from '../utils/security';

describe('Security validation & sanitization utilities', () => {
  it('validates safe asset IDs and rejects traversal or prototype keys', () => {
    expect(assertSafeAssetId('doc_123-abc')).toBe('doc_123-abc');
    expect(() => assertSafeAssetId('../etc/passwd')).toThrow();
    expect(() => assertSafeAssetId('a/b')).toThrow();
    expect(() => assertSafeAssetId('__proto__')).toThrow();
    expect(() => assertSafeAssetId('constructor')).toThrow();
    expect(() => assertSafeAssetId('')).toThrow();
  });

  it('rejects CR/LF injection in MIME types', () => {
    expect(assertValidMimeType('application/json')).toBe('application/json');
    expect(assertValidMimeType('image/jpeg')).toBe('image/jpeg');
    expect(() =>
      assertValidMimeType('image/jpeg\r\nAuthorization: Bearer evil'),
    ).toThrow();
    expect(() => assertValidMimeType('bad type')).toThrow();
  });

  it('escapes backslashes and quotes in Drive search literals', () => {
    expect(escapeDriveQueryValue("doc' or trashed = true -- \\test")).toBe(
      "doc\\' or trashed = true -- \\\\test",
    );
  });

  it('performs prototype-safe pagesByDoc lookups', () => {
    const pagesByDoc = {
      doc_1: [{ id: 'p1' }],
    };
    expect(getPagesForDoc(pagesByDoc, 'doc_1')).toEqual([{ id: 'p1' }]);
    expect(getPagesForDoc(pagesByDoc, 'constructor')).toEqual([]);
    expect(getPagesForDoc(pagesByDoc, '__proto__')).toEqual([]);
    expect(getPagesForDoc(pagesByDoc, 'toString')).toEqual([]);
    expect(getPagesForDoc(pagesByDoc, undefined)).toEqual([]);
  });

  it('parses JSON safely with fallback on malformed payloads', () => {
    expect(safeJsonParse('{"ok":true}', { ok: false })).toEqual({ ok: true });
    expect(safeJsonParse('{corrupted json', ['fallback'])).toEqual([
      'fallback',
    ]);
    expect(safeJsonParse(null, 42)).toBe(42);
  });

  it('restricts local fetch fallback URIs to safe schemes', () => {
    expect(isSafeLocalFetchUri('file:///data/user/0/test.jpg')).toBe(true);
    expect(isSafeLocalFetchUri('content://media/external/images/1')).toBe(true);
    expect(isSafeLocalFetchUri('blob:https://cuang.dev/123')).toBe(true);
    expect(isSafeLocalFetchUri('data:image/jpeg;base64,/9j/')).toBe(true);
    expect(isSafeLocalFetchUri('https://evil.example/payload.jpg')).toBe(false);
    expect(isSafeLocalFetchUri('javascript:alert(1)')).toBe(false);
  });

  it('redacts tokens, emails, digit runs, and filesystem paths in errors', () => {
    const msg = sanitizeErrorMessage(
      'Bearer ya29.secretTokenValue failed for user alice@example.com at /home/agent/secret/doc.jpg (card 4111222233334444)',
    );
    expect(msg).not.toContain('ya29.secretTokenValue');
    expect(msg).not.toContain('alice@example.com');
    expect(msg).not.toContain('4111222233334444');
    expect(msg).not.toContain('/home/agent/secret');
    expect(msg).toContain('[redacted-email]');
    expect(msg).toContain('[redacted-number]');
  });

  it('validates and clamps remote Drive manifests while rejecting mismatches and traversal', () => {
    expect(() =>
      validateRemoteManifest(
        {
          version: 1,
          id: '../../escape',
          pages: [],
        },
        'doc_1',
      ),
    ).toThrow();

    expect(() =>
      validateRemoteManifest(
        {
          version: 1,
          id: 'doc_other',
          pages: [],
        },
        'doc_1',
      ),
    ).toThrow();

    expect(() =>
      validateRemoteManifest(
        {
          version: 2,
          id: 'doc_1',
          pages: [],
        },
        'doc_1',
      ),
    ).toThrow();

    const valid = validateRemoteManifest(
      {
        version: 1,
        id: 'doc_1',
        title: 'Clean Manifest',
        folderId: null,
        tags: ['tax', '  work  '],
        pageIds: ['p1'],
        ocrFullText: 'Total 10',
        createdAt: 1000,
        updatedAt: 2000,
        deletedAt: null,
        pages: [
          {
            id: 'p1',
            orderIndex: 0,
            width: 800,
            height: 1200,
            rotation: 90,
            filter: 'invalid_filter_falls_back',
            brightness: 500,
            contrast: -500,
            ocrText: 'Total 10',
            ocrBlocks: [{ text: 'Total', x: -1, y: 2, width: 0.2, height: 0.05 }],
            annotations: [
              { id: 'r1', type: 'redact', x: 0.1, y: 0.1, width: 0.2, height: 0.1, color: '#000000' },
              { id: '../bad', type: 'redact', x: 0, y: 0, width: 0.5, height: 0.5, color: '#000000' },
            ],
            updatedAt: 2000,
          },
        ],
      },
      'doc_1',
    );

    expect(valid.id).toBe('doc_1');
    expect(valid.tags).toEqual(['tax', 'work']);
    expect(valid.pages[0].filter).toBe('original');
    expect(valid.pages[0].brightness).toBe(100);
    expect(valid.pages[0].contrast).toBe(-100);
    expect(valid.pages[0].ocrBlocks[0].x).toBe(0);
    expect(valid.pages[0].ocrBlocks[0].y).toBe(1);
    expect(valid.pages[0].annotations).toHaveLength(1);
    expect(valid.pages[0].annotations[0].id).toBe('r1');
  });
});
