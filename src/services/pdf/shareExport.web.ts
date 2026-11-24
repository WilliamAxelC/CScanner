import { storage } from '../../storage';
import type { Document, ExportOptions, Page, QualityPreset } from '../../types/models';
import { safeFileStem } from '../../utils/format';
import { reencodeJpegForExport } from '../image/processor';
import { buildPdfBytes, type PdfPageInput } from './pdfExporter';

const QUALITY_MAP: Record<QualityPreset, { maxDim: number; jpegQuality: number }> = {
  low: { maxDim: 1100, jpegQuality: 0.58 },
  medium: { maxDim: 1650, jpegQuality: 0.78 },
  high: { maxDim: 2400, jpegQuality: 0.92 },
};

export async function buildDocumentPdfBytes(
  _doc: Document,
  pages: Page[],
  options: ExportOptions,
): Promise<Uint8Array> {
  const { maxDim, jpegQuality } = QUALITY_MAP[options.quality];
  const signatures = await storage.listSignatures();
  const sigBytesMap: Record<string, Uint8Array> = {};
  for (const sig of signatures) {
    try {
      sigBytesMap[sig.id] = await storage.readImageBytes(sig.pngUri);
    } catch {
      // ignore missing signature
    }
  }

  const pageInputs: PdfPageInput[] = [];
  for (const page of pages) {
    const encoded = await reencodeJpegForExport(
      page.processedUri,
      maxDim,
      jpegQuality,
    );
    pageInputs.push({
      jpegBytes: encoded.bytes,
      width: encoded.width,
      height: encoded.height,
      ocrBlocks: options.includeOcrLayer ? page.ocrBlocks : undefined,
      annotations: page.annotations,
      signatureImages: sigBytesMap,
    });
  }

  return buildPdfBytes(pageInputs, options);
}

function triggerBrowserDownload(bytes: Uint8Array, fileName: string, mimeType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportAndShareDocument(
  doc: Document,
  pages: Page[],
  options: ExportOptions,
): Promise<{ fileName: string; byteLength: number }> {
  const stem = safeFileStem(doc.title);

  if (options.format === 'pdf') {
    const pdfBytes = await buildDocumentPdfBytes(doc, pages, options);
    const fileName = `${stem}.pdf`;
    const copy = new Uint8Array(pdfBytes.byteLength);
    copy.set(pdfBytes);
    const file = new File([copy.buffer], fileName, { type: 'application/pdf' });

    if (
      typeof navigator !== 'undefined' &&
      'canShare' in navigator &&
      navigator.canShare?.({ files: [file] })
    ) {
      try {
        await navigator.share({ files: [file], title: doc.title });
        return { fileName, byteLength: pdfBytes.byteLength };
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          return { fileName, byteLength: pdfBytes.byteLength };
        }
      }
    }

    triggerBrowserDownload(pdfBytes, fileName, 'application/pdf');
    return { fileName, byteLength: pdfBytes.byteLength };
  }

  const { maxDim, jpegQuality } = QUALITY_MAP[options.quality];
  let totalBytes = 0;
  let lastFileName = `${stem}.jpg`;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const encoded = await reencodeJpegForExport(
      page.processedUri,
      maxDim,
      jpegQuality,
    );
    const suffix = pages.length > 1 ? `_p${i + 1}` : '';
    lastFileName = `${stem}${suffix}.jpg`;
    triggerBrowserDownload(encoded.bytes, lastFileName, 'image/jpeg');
    totalBytes += encoded.bytes.byteLength;
  }
  return { fileName: lastFileName, byteLength: totalBytes };
}
