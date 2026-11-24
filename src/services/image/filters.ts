import type { FilterPreset } from '../../types/models';

export interface FilterOptions {
  filter: FilterPreset;
  brightness: number; // -100..100
  contrast: number; // -100..100
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function applyBrightnessContrastValue(
  v: number,
  brightness: number,
  contrastFactor: number,
): number {
  const shifted = v + brightness * 1.25;
  return clampByte((shifted - 128) * contrastFactor + 128);
}

function buildIntegralImage(
  gray: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const w1 = width + 1;
  const sat = new Float64Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    const srcOffset = (y - 1) * width;
    const dstOffset = y * w1;
    const prevOffset = (y - 1) * w1;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[srcOffset + (x - 1)];
      sat[dstOffset + x] = sat[prevOffset + x] + rowSum;
    }
  }
  return sat;
}

function localMeanAt(
  sat: Float64Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): number {
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const x1 = Math.min(width - 1, x + radius);
  const y1 = Math.min(height - 1, y + radius);
  const w1 = width + 1;

  const sum =
    sat[(y1 + 1) * w1 + (x1 + 1)] -
    sat[y0 * w1 + (x1 + 1)] -
    sat[(y1 + 1) * w1 + x0] +
    sat[y0 * w1 + x0];

  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  return sum / count;
}

function percentileBounds(channel: Uint8Array, lowPct = 0.02, highPct = 0.98) {
  const hist = new Int32Array(256);
  for (let i = 0; i < channel.length; i++) hist[channel[i]]++;

  const total = channel.length;
  const lowTarget = total * lowPct;
  const highTarget = total * highPct;

  let acc = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowTarget) {
      low = i;
      break;
    }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= highTarget) {
      high = i;
      break;
    }
  }
  if (high <= low) high = low + 1;
  return { low, high };
}

/**
 * Applies CamScanner-style lossless enhancement presets + brightness/contrast adjustments to an RGBA buffer.
 */
export function applyFilterRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: FilterOptions,
): Uint8ClampedArray {
  const { filter, brightness, contrast } = options;
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(rgba.length);

  const contrastFactor =
    contrast >= 0
      ? 1 + (contrast / 100) * 1.5
      : Math.max(0.15, 1 + contrast / 120);

  if (filter === 'original') {
    if (brightness === 0 && contrast === 0) {
      out.set(rgba);
      return out;
    }
    for (let i = 0; i < rgba.length; i += 4) {
      out[i] = applyBrightnessContrastValue(
        rgba[i],
        brightness,
        contrastFactor,
      );
      out[i + 1] = applyBrightnessContrastValue(
        rgba[i + 1],
        brightness,
        contrastFactor,
      );
      out[i + 2] = applyBrightnessContrastValue(
        rgba[i + 2],
        brightness,
        contrastFactor,
      );
      out[i + 3] = 255;
    }
    return out;
  }

  if (filter === 'grayscale') {
    for (let i = 0; i < rgba.length; i += 4) {
      const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      const v = applyBrightnessContrastValue(l, brightness, contrastFactor);
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
    return out;
  }

  if (filter === 'lighten') {
    const gamma = 0.68;
    for (let i = 0; i < rgba.length; i += 4) {
      const r = 255 * Math.pow(rgba[i] / 255, gamma);
      const g = 255 * Math.pow(rgba[i + 1] / 255, gamma);
      const b = 255 * Math.pow(rgba[i + 2] / 255, gamma);
      out[i] = applyBrightnessContrastValue(r, brightness + 10, contrastFactor);
      out[i + 1] = applyBrightnessContrastValue(
        g,
        brightness + 10,
        contrastFactor,
      );
      out[i + 2] = applyBrightnessContrastValue(
        b,
        brightness + 10,
        contrastFactor,
      );
      out[i + 3] = 255;
    }
    return out;
  }

  // Compute luminance channel for integral-image adaptive filtering
  const gray = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    gray[p] = Math.round(
      0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2],
    );
  }
  const sat = buildIntegralImage(gray, width, height);
  const radius = Math.max(8, Math.round(Math.min(width, height) / 22));

  if (filter === 'bw') {
    // Adaptive local mean thresholding so shadows turn clean white while ink remains dark
    const bias = 11 - brightness * 0.2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        const mean = localMeanAt(sat, width, height, x, y, radius);
        const val = gray[p] < mean - bias ? 0 : 255;
        const i = p * 4;
        out[i] = val;
        out[i + 1] = val;
        out[i + 2] = val;
        out[i + 3] = 255;
      }
    }
    return out;
  }

  // 'magic': white-balance paper normalization + local shadow flattening + crisp contrast
  const rChan = new Uint8Array(pixelCount);
  const gChan = new Uint8Array(pixelCount);
  const bChan = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    rChan[p] = rgba[i];
    gChan[p] = rgba[i + 1];
    bChan[p] = rgba[i + 2];
  }

  const rBounds = percentileBounds(rChan, 0.02, 0.97);
  const gBounds = percentileBounds(gChan, 0.02, 0.97);
  const bBounds = percentileBounds(bChan, 0.02, 0.97);

  const magicContrast = contrastFactor * 1.18;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const localBg = localMeanAt(sat, width, height, x, y, radius);
      const normScale = localBg > 32 ? Math.min(2.1, 235 / localBg) : 1.0;

      const rs =
        ((rgba[i] - rBounds.low) * 255) / (rBounds.high - rBounds.low);
      const gs =
        ((rgba[i + 1] - gBounds.low) * 255) / (gBounds.high - gBounds.low);
      const bs =
        ((rgba[i + 2] - bBounds.low) * 255) / (bBounds.high - bBounds.low);

      // Blend stretched color with shadow-flattened illumination
      const rBoost = rs * (0.45 + 0.55 * Math.min(1.4, normScale));
      const gBoost = gs * (0.45 + 0.55 * Math.min(1.4, normScale));
      const bBoost = bs * (0.45 + 0.55 * Math.min(1.4, normScale));

      // Mild saturation boost for vivid ink/stamps
      const l = 0.299 * rBoost + 0.587 * gBoost + 0.114 * bBoost;
      const satFactor = 1.18;
      const rFinal = l + (rBoost - l) * satFactor;
      const gFinal = l + (gBoost - l) * satFactor;
      const bFinal = l + (bBoost - l) * satFactor;

      out[i] = applyBrightnessContrastValue(rFinal, brightness, magicContrast);
      out[i + 1] = applyBrightnessContrastValue(
        gFinal,
        brightness,
        magicContrast,
      );
      out[i + 2] = applyBrightnessContrastValue(
        bFinal,
        brightness,
        magicContrast,
      );
      out[i + 3] = 255;
    }
  }

  return out;
}
