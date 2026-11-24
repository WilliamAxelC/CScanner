import { storage } from '../../storage/database.web';
import type { FilterPreset, Quad, RedactAnnotation } from '../../types/models';
import { generateId } from '../../utils/ids';
import { detectDocumentQuad } from './autoEdge';
import { applyFilterRGBA } from './filters';
import {
  computeOutputDimensions,
  warpPerspectiveRGBA,
} from './homography';

export interface ProcessImageParams {
  inputUri: string;
  outputId: string;
  quad?: Quad;
  rotation: 0 | 90 | 180 | 270;
  filter: FilterPreset;
  brightness: number;
  contrast: number;
  quality?: number;
}

export interface ProcessedImageResult {
  uri: string;
  width: number;
  height: number;
}

async function loadCanvasFromUri(
  uri: string,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const bytes = await storage.readImageBytes(uri);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  // Cap largest dimension to 2200px to keep client-side Canvas fast & memory-safe
  const maxDim = 2200;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not obtain 2D canvas context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { canvas, ctx };
}

async function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality = 0.88,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function autoDetectQuadFromUri(uri: string): Promise<Quad> {
  const { canvas, ctx } = await loadCanvasFromUri(uri);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return detectDocumentQuad(imgData.data, canvas.width, canvas.height);
}

export async function processImage(
  params: ProcessImageParams,
): Promise<ProcessedImageResult> {
  const { canvas: srcCanvas, ctx: srcCtx } = await loadCanvasFromUri(
    params.inputUri,
  );
  let width = srcCanvas.width;
  let height = srcCanvas.height;
  let rgba: Uint8ClampedArray = srcCtx.getImageData(0, 0, width, height).data;

  // 1. Perspective warp if quad supplied
  if (params.quad) {
    const dims = computeOutputDimensions(width, height, params.quad);
    rgba = warpPerspectiveRGBA(
      rgba,
      width,
      height,
      params.quad,
      dims.width,
      dims.height,
    );
    width = dims.width;
    height = dims.height;
  }

  // 2. Apply enhancement filters & brightness/contrast
  if (
    params.filter !== 'original' ||
    params.brightness !== 0 ||
    params.contrast !== 0
  ) {
    rgba = applyFilterRGBA(rgba, width, height, {
      filter: params.filter,
      brightness: params.brightness,
      contrast: params.contrast,
    });
  }

  // Put processed pixels back on canvas
  const workCanvas = document.createElement('canvas');
  workCanvas.width = width;
  workCanvas.height = height;
  const workCtx = workCanvas.getContext('2d')!;
  const imgBuf = new Uint8ClampedArray(rgba.length);
  imgBuf.set(rgba);
  const outImg = new ImageData(imgBuf, width, height);
  workCtx.putImageData(outImg, 0, 0);

  // 3. Apply 90-degree step rotation
  let finalCanvas = workCanvas;
  const rot = ((params.rotation % 360) + 360) % 360;
  if (rot !== 0) {
    const rotCanvas = document.createElement('canvas');
    const swap = rot === 90 || rot === 270;
    rotCanvas.width = swap ? height : width;
    rotCanvas.height = swap ? width : height;
    const rotCtx = rotCanvas.getContext('2d')!;
    rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rotCtx.rotate((rot * Math.PI) / 180);
    rotCtx.drawImage(workCanvas, -width / 2, -height / 2);
    finalCanvas = rotCanvas;
    width = rotCanvas.width;
    height = rotCanvas.height;
  }

  const quality = Math.min(1, Math.max(0.3, (params.quality ?? 88) / 100));
  const bytes = await canvasToJpegBytes(finalCanvas, quality);
  const uri = await storage.saveImageBytes(params.outputId, bytes, 'jpg');

  return { uri, width, height };
}

export async function composeIdCard(params: {
  frontUri: string;
  backUri: string;
  outputId?: string;
}): Promise<ProcessedImageResult> {
  const { canvas: frontCanvas } = await loadCanvasFromUri(params.frontUri);
  const { canvas: backCanvas } = await loadCanvasFromUri(params.backUri);

  const pageW = 1240;
  const pageH = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = pageW;
  canvas.height = pageH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pageW, pageH);

  const maxSlotW = pageW - 220;
  const maxSlotH = 660;

  const drawCard = (card: HTMLCanvasElement, centerY: number) => {
    const scale = Math.min(maxSlotW / card.width, maxSlotH / card.height);
    const dw = card.width * scale;
    const dh = card.height * scale;
    const left = (pageW - dw) / 2;
    const top = centerY - dh / 2;
    ctx.drawImage(card, left, top, dw, dh);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, dw, dh);
  };

  drawCard(frontCanvas, pageH * 0.28);
  drawCard(backCanvas, pageH * 0.72);

  const bytes = await canvasToJpegBytes(canvas, 0.92);
  const uri = await storage.saveImageBytes(
    params.outputId || `idcard_${generateId()}`,
    bytes,
    'jpg',
  );
  return { uri, width: pageW, height: pageH };
}

export async function reencodeJpegForExport(
  uri: string,
  maxWidth: number,
  quality: number,
  redactions?: RedactAnnotation[],
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { canvas } = await loadCanvasFromUri(uri);
  const scale = Math.min(1, maxWidth / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, w, h);

  if (redactions?.length) {
    for (const r of redactions) {
      ctx.fillStyle = r.color === '#FFFFFF' ? '#FFFFFF' : '#000000';
      ctx.fillRect(r.x * w, r.y * h, r.width * w, r.height * h);
    }
  }

  const bytes = await canvasToJpegBytes(out, quality);
  return { bytes, width: w, height: h };
}
