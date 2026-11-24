import { createWorker, type Worker } from 'tesseract.js';
import { storage } from '../../storage/database.web';
import type { OcrBlock, OcrResult } from '../../types/models';

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng');
  }
  return workerPromise;
}

async function getImageDimensions(blob: Blob): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  const dims = { w: bmp.width, h: bmp.height };
  bmp.close();
  return dims;
}

export async function recognizeImageText(imageUri: string): Promise<OcrResult> {
  const bytes = await storage.readImageBytes(imageUri);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'image/jpeg' });
  const { w, h } = await getImageDimensions(blob);

  const worker = await getOcrWorker();
  const res = await worker.recognize(blob, {}, { blocks: true });

  const blocks: OcrBlock[] = [];
  const rawBlocks = res.data.blocks ?? [];
  for (const block of rawBlocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const text = (line.text ?? '').trim();
        if (!text) continue;
        const b = line.bbox;
        blocks.push({
          text,
          x: Math.max(0, Math.min(1, b.x0 / Math.max(1, w))),
          y: Math.max(0, Math.min(1, b.y0 / Math.max(1, h))),
          width: Math.max(0.01, Math.min(1, (b.x1 - b.x0) / Math.max(1, w))),
          height: Math.max(0.01, Math.min(1, (b.y1 - b.y0) / Math.max(1, h))),
        });
      }
    }
  }

  return {
    fullText: (res.data.text ?? '').trim(),
    blocks,
  };
}
