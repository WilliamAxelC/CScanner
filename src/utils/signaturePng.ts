export interface StrokePoint {
  x: number; // normalized 0..1
  y: number;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < bytes.length; i++) {
    s1 = (s1 + bytes[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

/**
 * Encodes an RGBA pixel buffer as a standards-compliant PNG using stored deflate blocks (no Node zlib needed).
 */
export function encodeRgbaToPng(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    raw.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * stride + 1,
    );
  }

  // Wrap raw scanlines in zlib stored blocks (max 65535 bytes per block)
  const MAX_BLOCK = 65535;
  const numBlocks = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const zlibParts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];

  for (let b = 0; b < numBlocks; b++) {
    const start = b * MAX_BLOCK;
    const end = Math.min(raw.length, start + MAX_BLOCK);
    const len = end - start;
    const isLast = b === numBlocks - 1 ? 1 : 0;
    const hdr = new Uint8Array(5);
    hdr[0] = isLast;
    hdr[1] = len & 0xff;
    hdr[2] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    hdr[3] = nlen & 0xff;
    hdr[4] = (nlen >>> 8) & 0xff;
    zlibParts.push(hdr, raw.subarray(start, end));
  }

  const adler = new Uint8Array(4);
  writeU32BE(adler, 0, adler32(raw));
  zlibParts.push(adler);

  const idatTotal = zlibParts.reduce((s, p) => s + p.length, 0);
  const idatData = new Uint8Array(idatTotal);
  let pos = 0;
  for (const p of zlibParts) {
    idatData.set(p, pos);
    pos += p.length;
  }

  const makeChunk = (tag: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    writeU32BE(out, 0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = tag.charCodeAt(i);
    out.set(data, 8);
    writeU32BE(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const c1 = makeChunk('IHDR', ihdr);
  const c2 = makeChunk('IDAT', idatData);
  const c3 = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let off = 0;
  for (const part of [sig, c1, c2, c3]) {
    png.set(part, off);
    off += part.length;
  }
  return png;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }
  return [15, 23, 42];
}

export function strokesToSvgPath(
  strokes: StrokePoint[][],
  width = 480,
  height = 220,
): string {
  return strokes
    .filter((s) => s.length > 0)
    .map((stroke) =>
      stroke
        .map((pt, idx) => {
          const cmd = idx === 0 ? 'M' : 'L';
          return `${cmd}${(pt.x * width).toFixed(1)},${(pt.y * height).toFixed(1)}`;
        })
        .join(' '),
    )
    .join(' ');
}

/**
 * Rasterizes vector signature strokes onto a transparent RGBA PNG for embedding inside PDFs and overlays.
 */
export function renderSignaturePng(
  strokes: StrokePoint[][],
  inkHex = '#0F172A',
  width = 480,
  height = 220,
  brushRadius = 3.2,
): Uint8Array {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = hexToRgb(inkHex);
  const r2 = brushRadius * brushRadius;

  const paintDot = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - brushRadius - 1));
    const y0 = Math.max(0, Math.floor(cy - brushRadius - 1));
    const x1 = Math.min(width - 1, Math.ceil(cx + brushRadius + 1));
    const y1 = Math.min(height - 1, Math.ceil(cy + brushRadius + 1));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= r2) {
          const edgeAlpha =
            d2 > (brushRadius - 1) * (brushRadius - 1)
              ? Math.max(0, Math.min(1, brushRadius - Math.sqrt(d2)))
              : 1;
          const idx = (y * width + x) * 4;
          const alphaByte = Math.round(edgeAlpha * 255);
          if (alphaByte > rgba[idx + 3]) {
            rgba[idx] = r;
            rgba[idx + 1] = g;
            rgba[idx + 2] = b;
            rgba[idx + 3] = alphaByte;
          }
        }
      }
    }
  };

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    for (let i = 0; i < stroke.length; i++) {
      const p0 = stroke[i];
      const x0 = p0.x * (width - 1);
      const y0 = p0.y * (height - 1);
      if (i === 0) {
        paintDot(x0, y0);
        continue;
      }
      const prev = stroke[i - 1];
      const px = prev.x * (width - 1);
      const py = prev.y * (height - 1);
      const dist = Math.hypot(x0 - px, y0 - py);
      const steps = Math.max(1, Math.ceil(dist / 1.5));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        paintDot(px + (x0 - px) * t, py + (y0 - py) * t);
      }
    }
  }

  return encodeRgbaToPng(rgba, width, height);
}
