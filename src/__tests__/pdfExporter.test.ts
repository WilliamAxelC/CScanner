import zlib from 'node:zlib';
import { PDFDocument } from '@cantoo/pdf-lib';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { buildPdfBytes, sanitizeWinAnsi } from '../services/pdf/pdfExporter';

function makeSolidJpeg(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 240;
    data[i + 1] = 244;
    data[i + 2] = 248;
    data[i + 3] = 255;
  }
  const encoded = jpeg.encode({ data, width, height }, 80);
  return new Uint8Array(encoded.data);
}

function makeTinyPng(): Uint8Array {
  // Valid 2x2 RGBA PNG generated via Node zlib
  const w = 2;
  const h = 2;
  const raw = Buffer.from([
    0, 13, 148, 136, 255, 13, 148, 136, 255,
    0, 13, 148, 136, 255, 13, 148, 136, 255,
  ]);
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag: string, data: Buffer) => {
    const tagBuf = Buffer.from(tag, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])), 0);
    return Buffer.concat([len, tagBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(raw);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

describe('PDF Export Engine', () => {
  it('sanitizes non-WinAnsi characters safely', () => {
    expect(sanitizeWinAnsi('Smart “Quote” — Test 🚀')).toBe(
      'Smart "Quote" - Test   ',
    );
  });

  it('builds searchable A4 PDF with annotations and AES-256 password encryption', async () => {
    const jpg1 = makeSolidJpeg(200, 280);
    const jpg2 = makeSolidJpeg(280, 200);
    const sigPng = makeTinyPng();

    const pdfBytes = await buildPdfBytes(
      [
        {
          jpegBytes: jpg1,
          width: 200,
          height: 280,
          ocrBlocks: [
            {
              text: 'Invoice #1042 — Smart Quote “OK”',
              x: 0.1,
              y: 0.15,
              width: 0.5,
              height: 0.05,
            },
          ],
          annotations: [
            {
              id: 'r1',
              type: 'redact',
              x: 0.1,
              y: 0.5,
              width: 0.3,
              height: 0.08,
              color: '#000000',
            },
            {
              id: 'w1',
              type: 'watermark',
              text: 'CONFIDENTIAL',
              opacity: 0.25,
              angle: -35,
              tiled: true,
              color: '#64748B',
            },
            {
              id: 's1',
              type: 'signature',
              signatureId: 'sig-1',
              x: 0.6,
              y: 0.75,
              width: 0.25,
              height: 0.1,
            },
          ],
          signatureImages: { 'sig-1': sigPng },
        },
        {
          jpegBytes: jpg2,
          width: 280,
          height: 200,
        },
      ],
      {
        format: 'pdf',
        pageSize: 'a4',
        quality: 'medium',
        includeOcrLayer: true,
        password: 'cscanner-secret-pw',
      },
    );

    expect(pdfBytes.byteLength).toBeGreaterThan(500);

    // Loading without password must throw
    await expect(PDFDocument.load(pdfBytes)).rejects.toThrow();

    // Loading with password succeeds and verifies page sizes
    const unlocked = await PDFDocument.load(pdfBytes, {
      password: 'cscanner-secret-pw',
    });
    expect(unlocked.getPageCount()).toBe(2);
    const p1 = unlocked.getPage(0).getSize();
    expect(p1.width).toBeCloseTo(595.28, 1);
    expect(p1.height).toBeCloseTo(841.89, 1);

    // Landscape image auto-orients A4 to landscape
    const p2 = unlocked.getPage(1).getSize();
    expect(p2.width).toBeCloseTo(841.89, 1);
    expect(p2.height).toBeCloseTo(595.28, 1);
  });

  it('supports letter and auto page sizes without password', async () => {
    const jpg = makeSolidJpeg(300, 150);

    const letterBytes = await buildPdfBytes(
      [{ jpegBytes: jpg, width: 300, height: 150 }],
      {
        format: 'pdf',
        pageSize: 'letter',
        quality: 'high',
        includeOcrLayer: false,
      },
    );
    const letterDoc = await PDFDocument.load(letterBytes);
    const lSize = letterDoc.getPage(0).getSize();
    expect(lSize.width).toBeCloseTo(792, 1);
    expect(lSize.height).toBeCloseTo(612, 1);

    const autoBytes = await buildPdfBytes(
      [{ jpegBytes: jpg, width: 300, height: 150 }],
      {
        format: 'pdf',
        pageSize: 'auto',
        quality: 'low',
        includeOcrLayer: false,
      },
    );
    const autoDoc = await PDFDocument.load(autoBytes);
    const aSize = autoDoc.getPage(0).getSize();
    expect(aSize.width).toBeCloseTo(595.28, 1);
    expect(aSize.height).toBeCloseTo(595.28 / 2, 1);
  });
});
