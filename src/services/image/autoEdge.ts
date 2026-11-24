import type { Point, Quad } from '../../types/models';

export const DEFAULT_QUAD: Quad = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
];

function computeOtsuThreshold(values: Uint8Array): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < values.length; i++) {
    hist[values[i]]++;
  }

  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const diff = mB - mF;
    const betweenVar = wB * wF * diff * diff;
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }

  return threshold;
}

function quadArea(q: Quad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) * 0.5;
}

function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = q[i];
    const p1 = q[(i + 1) % 4];
    const p2 = q[(i + 2) % 4];
    const cross =
      (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function orderCorners(pts: Point[]): Quad {
  // TL minimizes x + y, BR maximizes x + y, TR maximizes x - y, BL minimizes x - y
  let tl = pts[0];
  let tr = pts[0];
  let br = pts[0];
  let bl = pts[0];

  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;

  for (const p of pts) {
    const sum = p.x + p.y;
    const diff = p.x - p.y;
    if (sum < minSum) {
      minSum = sum;
      tl = p;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = p;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = p;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = p;
    }
  }

  return [tl, tr, br, bl];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function extractExtremesFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
): Quad | null {
  let tlP: Point | null = null;
  let trP: Point | null = null;
  let brP: Point | null = null;
  let blP: Point | null = null;

  let minSum = Infinity;
  let maxSum = -Infinity;
  let maxDiff = -Infinity;
  let minDiff = Infinity;
  let count = 0;

  // Ignore 1px outer border to avoid canvas edge artifacts
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (mask[y * w + x] === 0) continue;
      count++;
      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        tlP = { x: x / (w - 1), y: y / (h - 1) };
      }
      if (sum > maxSum) {
        maxSum = sum;
        brP = { x: x / (w - 1), y: y / (h - 1) };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        trP = { x: x / (w - 1), y: y / (h - 1) };
      }
      if (diff < minDiff) {
        minDiff = diff;
        blP = { x: x / (w - 1), y: y / (h - 1) };
      }
    }
  }

  if (count < w * h * 0.02 || !tlP || !trP || !brP || !blP) {
    return null;
  }

  const ordered = orderCorners([tlP, trP, brP, blP]).map((p) => ({
    x: clamp01(p.x),
    y: clamp01(p.y),
  })) as Quad;

  const area = quadArea(ordered);
  if (area < 0.15 || area > 0.98 || !isConvexQuad(ordered)) {
    return null;
  }
  return ordered;
}

/**
 * Automatically detects the likely 4-corner document quadrilateral in an RGBA image.
 * Works purely on pixel buffers (no native or DOM dependencies).
 */
export function detectDocumentQuad(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Quad {
  if (width < 16 || height < 16) return DEFAULT_QUAD;

  // 1. Downscale to <= 256px
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const dw = Math.max(24, Math.round(width * scale));
  const dh = Math.max(24, Math.round(height * scale));

  const lum = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(height - 1, Math.floor((y / dh) * height));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(width - 1, Math.floor((x / dw) * width));
      const idx = (sy * width + sx) * 4;
      lum[y * dw + x] = Math.round(
        0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2],
      );
    }
  }

  // 2. 3x3 Gaussian blur
  const blurred = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      if (x === 0 || y === 0 || x === dw - 1 || y === dh - 1) {
        blurred[y * dw + x] = lum[y * dw + x];
        continue;
      }
      const i = y * dw + x;
      const val =
        lum[i - dw - 1] +
        2 * lum[i - dw] +
        lum[i - dw + 1] +
        2 * lum[i - 1] +
        4 * lum[i] +
        2 * lum[i + 1] +
        lum[i + dw - 1] +
        2 * lum[i + dw] +
        lum[i + dw + 1];
      blurred[i] = val >> 4;
    }
  }

  // 3. First try bright-paper mask via Otsu (great for documents on dark desks/surfaces)
  const lumThresh = computeOtsuThreshold(blurred);
  const brightMask = new Uint8Array(dw * dh);
  let brightEdgeBorderCount = 0;
  const borderSample = (dw + dh) * 2;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const i = y * dw + x;
      if (blurred[i] >= lumThresh) {
        brightMask[i] = 1;
        if (x === 0 || y === 0 || x === dw - 1 || y === dh - 1) {
          brightEdgeBorderCount++;
        }
      }
    }
  }

  // Only accept bright mask if the bright foreground doesn't flood the entire border
  if (brightEdgeBorderCount < borderSample * 0.45) {
    const brightQuad = extractExtremesFromMask(brightMask, dw, dh);
    if (brightQuad) {
      return brightQuad;
    }
  }

  // 4. Fallback to Sobel edge magnitude mask
  const edgeMag = new Uint8Array(dw * dh);
  for (let y = 1; y < dh - 1; y++) {
    for (let x = 1; x < dw - 1; x++) {
      const i = y * dw + x;
      const gx =
        -blurred[i - dw - 1] +
        blurred[i - dw + 1] -
        2 * blurred[i - 1] +
        2 * blurred[i + 1] -
        blurred[i + dw - 1] +
        blurred[i + dw + 1];
      const gy =
        -blurred[i - dw - 1] -
        2 * blurred[i - dw] -
        blurred[i - dw + 1] +
        blurred[i + dw - 1] +
        2 * blurred[i + dw] +
        blurred[i + dw + 1];
      const mag = Math.min(255, Math.round(Math.hypot(gx, gy) * 0.25));
      edgeMag[i] = mag;
    }
  }

  const edgeThresh = Math.max(24, computeOtsuThreshold(edgeMag));
  const edgeMask = new Uint8Array(dw * dh);
  for (let i = 0; i < edgeMag.length; i++) {
    if (edgeMag[i] >= edgeThresh) edgeMask[i] = 1;
  }

  const edgeQuad = extractExtremesFromMask(edgeMask, dw, dh);
  if (edgeQuad) {
    return edgeQuad;
  }

  return DEFAULT_QUAD;
}
