import type { Point, Quad } from '../../types/models';

/**
 * Solves an 8x8 linear system Ax = b via Gaussian elimination with partial pivoting.
 */
function solveLinearSystem8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const absVal = Math.abs(M[row][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        pivotRow = row;
      }
    }

    if (maxVal < 1e-12) {
      throw new Error('Singular homography matrix');
    }

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Computes a 3x3 planar homography matrix (row-major length 9) mapping src[i] -> dst[i].
 */
export function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [Point, Point, Point, Point],
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Estimates crisp output pixel dimensions for a normalized document quad.
 */
export function computeOutputDimensions(
  srcW: number,
  srcH: number,
  quad: Quad,
  maxDim = 2200,
): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;

  const dist = (a: Point, b: Point) =>
    Math.hypot((b.x - a.x) * srcW, (b.y - a.y) * srcH);

  const widthTop = dist(tl, tr);
  const widthBottom = dist(bl, br);
  const heightLeft = dist(tl, bl);
  const heightRight = dist(tr, br);

  let width = Math.max(64, Math.round(Math.max(widthTop, widthBottom)));
  let height = Math.max(64, Math.round(Math.max(heightLeft, heightRight)));

  const largest = Math.max(width, height);
  if (largest > maxDim) {
    const scale = maxDim / largest;
    width = Math.max(64, Math.round(width * scale));
    height = Math.max(64, Math.round(height * scale));
  }

  return { width, height };
}

/**
 * Applies inverse perspective warp with bilinear interpolation from normalized quad -> rectangular RGBA buffer.
 */
export function warpPerspectiveRGBA(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  quad: Quad,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const dstRect: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 },
  ];

  const srcPts: [Point, Point, Point, Point] = [
    { x: quad[0].x * (srcW - 1), y: quad[0].y * (srcH - 1) },
    { x: quad[1].x * (srcW - 1), y: quad[1].y * (srcH - 1) },
    { x: quad[2].x * (srcW - 1), y: quad[2].y * (srcH - 1) },
    { x: quad[3].x * (srcW - 1), y: quad[3].y * (srcH - 1) },
  ];

  // Inverse mapping: dst pixel -> src pixel
  const H = computeHomography(dstRect, srcPts);
  const out = new Uint8ClampedArray(dstW * dstH * 4);

  const h0 = H[0],
    h1 = H[1],
    h2 = H[2];
  const h3 = H[3],
    h4 = H[4],
    h5 = H[5];
  const h6 = H[6],
    h7 = H[7],
    h8 = H[8];

  const maxX = srcW - 1;
  const maxY = srcH - 1;

  for (let y = 0; y < dstH; y++) {
    const rowBaseX = h1 * y + h2;
    const rowBaseY = h4 * y + h5;
    const rowBaseW = h7 * y + h8;

    for (let x = 0; x < dstW; x++) {
      const denom = h6 * x + rowBaseW;
      const sx = denom !== 0 ? (h0 * x + rowBaseX) / denom : 0;
      const sy = denom !== 0 ? (h3 * x + rowBaseY) / denom : 0;

      const cx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      const cy = sy < 0 ? 0 : sy > maxY ? maxY : sy;

      const x0 = cx | 0;
      const y0 = cy | 0;
      const x1 = x0 < maxX ? x0 + 1 : maxX;
      const y1 = y0 < maxY ? y0 + 1 : maxY;

      const fx = cx - x0;
      const fy = cy - y0;
      const invFx = 1 - fx;
      const invFy = 1 - fy;

      const w00 = invFx * invFy;
      const w10 = fx * invFy;
      const w01 = invFx * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const outIdx = (y * dstW + x) * 4;
      out[outIdx] =
        src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[outIdx + 1] =
        src[i00 + 1] * w00 +
        src[i10 + 1] * w10 +
        src[i01 + 1] * w01 +
        src[i11 + 1] * w11;
      out[outIdx + 2] =
        src[i00 + 2] * w00 +
        src[i10 + 2] * w10 +
        src[i01 + 2] * w01 +
        src[i11 + 2] * w11;
      out[outIdx + 3] = 255;
    }
  }

  return out;
}
