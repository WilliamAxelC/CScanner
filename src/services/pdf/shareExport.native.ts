import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
      // ignore deleted signature asset
    }
  }

  const pageInputs: PdfPageInput[] = [];
  for (const page of pages) {
    const targetMax = Math.min(maxDim, Math.max(page.width || maxDim, page.height || maxDim));
    const encoded = await reencodeJpegForExport(
      page.processedUri,
      targetMax,
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

export async function exportAndShareDocument(
  doc: Document,
  pages: Page[],
  options: ExportOptions,
): Promise<{ fileName: string; byteLength: number }> {
  const stem = safeFileStem(doc.title);

  if (options.format === 'pdf') {
    const pdfBytes = await buildDocumentPdfBytes(doc, pages, options);
    const fileName = `${stem}.pdf`;
    const file = new File(Paths.cache, fileName);
    file.create({ intermediates: true, overwrite: true });
    await file.write(pdfBytes);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${fileName}`,
      });
    }
    return { fileName, byteLength: pdfBytes.byteLength };
  }

  // JPEG export (shares pages sequentially or first/single page cleanly)
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
    const file = new File(Paths.cache, lastFileName);
    file.create({ intermediates: true, overwrite: true });
    await file.write(encoded.bytes);
    totalBytes += encoded.bytes.byteLength;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Share ${lastFileName}`,
      });
    }
  }
  return { fileName: lastFileName, byteLength: totalBytes };
}
