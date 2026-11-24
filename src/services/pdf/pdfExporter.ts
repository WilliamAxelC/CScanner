import { degrees, PDFDocument, rgb, StandardFonts } from '@cantoo/pdf-lib';
import type { Annotation, ExportOptions, OcrBlock, PageSizePreset } from '../../types/models';

export interface PdfPageInput {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
  ocrBlocks?: OcrBlock[];
  annotations?: Annotation[];
  signatureImages?: Record<string, Uint8Array>;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;

/**
 * Replaces characters outside WinAnsi Latin-1 range so StandardFonts.Helvetica never throws.
 */
export function sanitizeWinAnsi(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { r, g, b };
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return { r, g, b };
  }
  return { r: 0.4, g: 0.4, b: 0.4 };
}

export function resolvePageDimensions(
  imgWidth: number,
  imgHeight: number,
  preset: PageSizePreset,
): {
  pageW: number;
  pageH: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
} {
  const safeW = Math.max(1, imgWidth);
  const safeH = Math.max(1, imgHeight);

  if (preset === 'auto') {
    const pageW = 595.28;
    const pageH = (safeH / safeW) * pageW;
    return {
      pageW,
      pageH,
      drawX: 0,
      drawY: 0,
      drawW: pageW,
      drawH: pageH,
    };
  }

  const isLandscape = safeW > safeH;
  const baseW = preset === 'letter' ? LETTER_WIDTH : A4_WIDTH;
  const baseH = preset === 'letter' ? LETTER_HEIGHT : A4_HEIGHT;
  const pageW = isLandscape ? baseH : baseW;
  const pageH = isLandscape ? baseW : baseH;

  const scale = Math.min(pageW / safeW, pageH / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  const drawX = (pageW - drawW) / 2;
  const drawY = (pageH - drawH) / 2;

  return { pageW, pageH, drawX, drawY, drawW, drawH };
}

/**
 * Generates a PDF (with optional annotations, invisible searchable OCR text layer, and AES-256 encryption).
 */
export async function buildPdfBytes(
  pages: PdfPageInput[],
  options: ExportOptions,
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error('Cannot build PDF with 0 pages');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setCreator('CScanner');
  pdfDoc.setProducer('CScanner Offline Document Scanner');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const pageInput of pages) {
    const embeddedJpg = await pdfDoc.embedJpg(pageInput.jpegBytes);
    const dims = embeddedJpg.scale(1);
    const imgW = pageInput.width > 0 ? pageInput.width : dims.width;
    const imgH = pageInput.height > 0 ? pageInput.height : dims.height;

    const { pageW, pageH, drawX, drawY, drawW, drawH } = resolvePageDimensions(
      imgW,
      imgH,
      options.pageSize,
    );

    const pdfPage = pdfDoc.addPage([pageW, pageH]);

    // 1. Base scanned image
    pdfPage.drawImage(embeddedJpg, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });

    // 2. Annotations (redactions, signatures, watermarks)
    if (pageInput.annotations?.length) {
      for (const ann of pageInput.annotations) {
        if (ann.type === 'redact') {
          const rx = drawX + ann.x * drawW;
          const rw = ann.width * drawW;
          const rh = ann.height * drawH;
          const ry = drawY + drawH - ann.y * drawH - rh;
          const { r, g, b } = hexToRgb01(ann.color);
          pdfPage.drawRectangle({
            x: rx,
            y: ry,
            width: rw,
            height: rh,
            color: rgb(r, g, b),
          });
        } else if (ann.type === 'signature') {
          const pngBytes = pageInput.signatureImages?.[ann.signatureId];
          if (pngBytes && pngBytes.length > 0) {
            const sigImg = await pdfDoc.embedPng(pngBytes);
            const sx = drawX + ann.x * drawW;
            const sw = ann.width * drawW;
            const sh = ann.height * drawH;
            const sy = drawY + drawH - ann.y * drawH - sh;
            pdfPage.drawImage(sigImg, {
              x: sx,
              y: sy,
              width: sw,
              height: sh,
            });
          }
        } else if (ann.type === 'watermark' && ann.text.trim()) {
          const cleanText = sanitizeWinAnsi(ann.text.trim());
          const { r, g, b } = hexToRgb01(ann.color || '#64748B');
          const opacity = Math.min(0.85, Math.max(0.05, ann.opacity));
          const fontSize = ann.tiled
            ? Math.max(14, drawW * 0.042)
            : Math.max(24, drawW * 0.085);

          if (ann.tiled) {
            const cols = 3;
            const rows = 3;
            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const cx = drawX + ((col + 0.5) / cols) * drawW;
                const cy = drawY + ((row + 0.5) / rows) * drawH;
                const tw = font.widthOfTextAtSize(cleanText, fontSize);
                pdfPage.drawText(cleanText, {
                  x: cx - tw * 0.35,
                  y: cy,
                  size: fontSize,
                  font,
                  color: rgb(r, g, b),
                  opacity,
                  rotate: degrees(ann.angle),
                });
              }
            }
          } else {
            const tw = font.widthOfTextAtSize(cleanText, fontSize);
            pdfPage.drawText(cleanText, {
              x: drawX + drawW / 2 - tw * 0.38,
              y: drawY + drawH / 2,
              size: fontSize,
              font,
              color: rgb(r, g, b),
              opacity,
              rotate: degrees(ann.angle),
            });
          }
        }
      }
    }

    // 3. Invisible searchable OCR text layer
    if (options.includeOcrLayer && pageInput.ocrBlocks?.length) {
      for (const block of pageInput.ocrBlocks) {
        const clean = sanitizeWinAnsi(block.text).trim();
        if (!clean) continue;

        const boxH = Math.max(6, block.height * drawH);
        const boxW = Math.max(8, block.width * drawW);
        let fontSize = Math.min(72, Math.max(5, boxH * 0.85));

        const measured = font.widthOfTextAtSize(clean, fontSize);
        if (measured > boxW && measured > 0) {
          fontSize = Math.max(4, fontSize * (boxW / measured));
        }

        const tx = drawX + block.x * drawW;
        const ty = drawY + drawH - (block.y + block.height) * drawH;

        pdfPage.drawText(clean, {
          x: tx,
          y: ty,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      }
    }
  }

  const pw = options.password?.trim();
  if (pw) {
    await pdfDoc.encrypt({
      userPassword: pw,
      ownerPassword: pw,
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: true,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    });
  }

  return pdfDoc.save();
}
