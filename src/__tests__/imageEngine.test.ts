import { describe, expect, it } from 'vitest';
import { detectDocumentQuad } from '../services/image/autoEdge';
import { applyFilterRGBA } from '../services/image/filters';
import {
  computeHomography,
  computeOutputDimensions,
  warpPerspectiveRGBA,
} from '../services/image/homography';
import type { Point, Quad } from '../types/models';

function applyH(H: number[], p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
}

describe('Image & CV Engine', () => {
  it('computes exact planar homography for 4 point pairs', () => {
    const src: [Point, Point, Point, Point] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 150 },
      { x: 0, y: 150 },
    ];
    const dst: [Point, Point, Point, Point] = [
      { x: 12, y: 18 },
      { x: 96, y: 8 },
      { x: 112, y: 142 },
      { x: 4, y: 138 },
    ];

    const H = computeHomography(src, dst);
    for (let i = 0; i < 4; i++) {
      const mapped = applyH(H, src[i]);
      expect(mapped.x).toBeCloseTo(dst[i].x, 5);
      expect(mapped.y).toBeCloseTo(dst[i].y, 5);
    }
  });

  it('warps an inset document quad into a full rectangular RGBA buffer', () => {
    const w = 80;
    const h = 80;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // Dark surround, white paper inside [0.25..0.75, 0.25..0.75], blue square at center
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const nx = x / (w - 1);
        const ny = y / (h - 1);
        const inPaper = nx >= 0.23 && nx <= 0.77 && ny >= 0.23 && ny <= 0.77;
        const inCenter = nx >= 0.45 && nx <= 0.55 && ny >= 0.45 && ny <= 0.55;
        if (inCenter) {
          rgba[idx] = 20;
          rgba[idx + 1] = 40;
          rgba[idx + 2] = 220;
        } else if (inPaper) {
          rgba[idx] = 250;
          rgba[idx + 1] = 250;
          rgba[idx + 2] = 250;
        } else {
          rgba[idx] = 15;
          rgba[idx + 1] = 15;
          rgba[idx + 2] = 15;
        }
        rgba[idx + 3] = 255;
      }
    }

    const quad: Quad = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ];
    const dims = computeOutputDimensions(w, h, quad);
    const warped = warpPerspectiveRGBA(rgba, w, h, quad, dims.width, dims.height);

    // Top-left corner inside warped sheet should be white paper (~250)
    expect(warped[0]).toBeGreaterThan(230);
    // Center pixel should be the blue mark
    const cx = Math.floor(dims.width / 2);
    const cy = Math.floor(dims.height / 2);
    const ci = (cy * dims.width + cx) * 4;
    expect(warped[ci + 2]).toBeGreaterThan(180);
    expect(warped[ci]).toBeLessThan(60);
  });

  it('detects a tilted/inset bright document quad on a dark desk background', () => {
    const w = 140;
    const h = 180;
    const rgba = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const nx = x / (w - 1);
        const ny = y / (h - 1);
        const inside = nx >= 0.16 && nx <= 0.84 && ny >= 0.14 && ny <= 0.86;
        const val = inside ? 245 : 22;
        rgba[idx] = val;
        rgba[idx + 1] = val;
        rgba[idx + 2] = val;
        rgba[idx + 3] = 255;
      }
    }

    const quad = detectDocumentQuad(rgba, w, h);
    expect(quad[0].x).toBeGreaterThan(0.1);
    expect(quad[0].x).toBeLessThan(0.24);
    expect(quad[0].y).toBeGreaterThan(0.08);
    expect(quad[0].y).toBeLessThan(0.22);

    expect(quad[2].x).toBeGreaterThan(0.76);
    expect(quad[2].x).toBeLessThan(0.92);
    expect(quad[2].y).toBeGreaterThan(0.78);
    expect(quad[2].y).toBeLessThan(0.94);
  });

  it('applies grayscale, lighten, magic, and adaptive B&W filters accurately', () => {
    const w = 64;
    const h = 48;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // Uneven lighting: left half bright paper (220), right half shadowed paper (125), dark ink stripe in middle of each half
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const isInk =
          (x >= 14 && x <= 16 && y >= 14 && y <= 34) ||
          (x >= 46 && x <= 48 && y >= 14 && y <= 34);
        const bg = x < w / 2 ? 220 : 125;
        const r = isInk ? 35 : bg;
        const g = isInk ? 45 : bg - 5;
        const b = isInk ? 60 : bg - 10;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }

    const gray = applyFilterRGBA(rgba, w, h, {
      filter: 'grayscale',
      brightness: 0,
      contrast: 0,
    });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);

    const light = applyFilterRGBA(rgba, w, h, {
      filter: 'lighten',
      brightness: 0,
      contrast: 0,
    });
    const rightPaperIdx = (10 * w + 55) * 4;
    expect(light[rightPaperIdx]).toBeGreaterThan(rgba[rightPaperIdx]);

    const bw = applyFilterRGBA(rgba, w, h, {
      filter: 'bw',
      brightness: 0,
      contrast: 0,
    });
    // Both bright left paper & shadowed right paper should turn white (255), while ink turns black (0)
    expect(bw[(10 * w + 5) * 4]).toBe(255);
    expect(bw[(10 * w + 55) * 4]).toBe(255);
    expect(bw[(24 * w + 15) * 4]).toBe(0);
    expect(bw[(24 * w + 47) * 4]).toBe(0);

    const magic = applyFilterRGBA(rgba, w, h, {
      filter: 'magic',
      brightness: 0,
      contrast: 0,
    });
    expect(magic[rightPaperIdx]).toBeGreaterThan(rgba[rightPaperIdx]);
  });
});
