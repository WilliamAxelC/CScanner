# CScanner — Technical Specification

Ad-free, offline-first document scanner replacing CamScanner for **Android** (native-first via Expo SDK 58 + Google ML Kit) and **Web PWA** (Expo Web + HTML5 Canvas CV + Tesseract.js + Workbox), with **Google Drive (`drive.file`) offline-first sync**.

---

## 1. Architecture & Platform Strategy

| Layer | Android (Native-First) | Web PWA |
| :--- | :--- | :--- |
| **App Framework** | Expo SDK 58 (`expo-router`, TypeScript, Hermes) | Expo Web (`output: "single"`), Workbox SW + Web App Manifest |
| **Document Scanning** | Google ML Kit Document Scanner (`play-services-mlkit-document-scanner:16.0.0`) via local Expo Module `modules/cscanner-mlkit` | Live `<video>` capture (`getUserMedia`) or file import + pure-TS auto-edge detection & interactive 4-corner warp |
| **Image Processing** | Native Android `Bitmap` + `Matrix.setPolyToPoly` + Kotlin pixel filters | HTML5 Canvas + pure-TS 3×3 homography & pixel filter kernels |
| **On-Device OCR (Latin)** | Google ML Kit Text Recognition v2 (`com.google.mlkit:text-recognition:16.0.1`) | `tesseract.js` (`eng`, client-side Web Worker) |
| **Local Storage & Search** | `expo-sqlite` + FTS5 + `expo-file-system` | IndexedDB (`idb`) with tokenized full-text search & blob store |
| **PDF Export & Encryption** | `@cantoo/pdf-lib` (AES-256 encryption + invisible OCR text layer) + `expo-sharing` | `@cantoo/pdf-lib` + Web Share / Blob download |
| **Cloud Sync** | Google Drive REST v3 via `expo-auth-session` (`drive.file` scope) | Google Drive REST v3 via `expo-auth-session` (`drive.file` scope) |

---

## 2. Core Features (v1)

1. **Multi-Page Document Scanning & Import**
   - Native Android ML Kit document scanner flow (multi-page capture, auto-crop, edge detection, shadow cleanup) plus gallery photo import.
   - Web PWA live camera capture and multi-file upload with pure-TS auto-edge quad detection and draggable 4-corner perspective correction (`QuadCropEditor`).
   - Full page management: reorder pages, rotate 90°, delete pages, append new scanned or imported pages.
2. **Lossless Image Enhancement**
   - Original captures are stored untouched (`originalUri`) so filters, rotations, crops, and sliders can always be re-computed non-destructively.
   - Presets: `Original`, `Magic Color`, `Crisp B&W` (adaptive local-mean integral image thresholding), `Grayscale` (BT.709), `Lighten`.
   - Fine-grained `Brightness` (`-100..100`) and `Contrast` (`-100..100`) adjustments.
3. **ID Card Mode**
   - Guided 2-step Front + Back capture/import (with optional 4-corner crop per side) composited onto a single clean A4 portrait page (`1240×1754`) with balanced margins and subtle card frames.
4. **On-Device Latin OCR**
   - Extracts full text + normalized line bounding boxes (`OcrBlock[]`) completely offline.
   - Dedicated OCR screen to run/re-run OCR, copy text, and edit recognized text (updating both local full-text search and searchable PDF output).
5. **Signatures & Annotations**
   - **Signatures:** Reusable drawn signatures (SVG stroke capture exported as transparent PNG) placed, moved, and scaled onto any page.
   - **Watermarks:** Custom text overlay with configurable opacity, rotation angle, and single/tiled layout.
   - **Redactions:** Opaque black or white redaction rectangles baked cleanly into exported PDFs.
6. **PDF & JPEG Export with AES-256 Encryption**
   - Formats: Searchable PDF or JPEG images.
   - Page sizes: `Auto` (image aspect ratio), `A4`, `Letter`.
   - Quality presets: `Low` (compact), `Medium` (balanced), `High` (archival).
   - Optional invisible searchable OCR text layer (`opacity: 0`, WinAnsi-sanitized).
   - Optional AES-256 PDF password encryption via `@cantoo/pdf-lib`.
7. **Offline-First Organization & Google Drive Sync**
   - Folders, color tags, rename, grid/list layout, instant full-text search across titles, tags, and OCR text.
   - Works 100% offline with zero accounts required; when signed into Google Drive (`drive.file` scope), queues local mutations and syncs bidirectionally:
     - `My Drive/CScanner/<Folder>/<DocTitle>.pdf` — human-browsable PDFs directly in Google Drive.
     - `My Drive/CScanner/.cscanner-meta/doc-<id>.json` & `page-<id>.jpg` — lossless metadata, OCR text, annotations, and original images for cross-device re-editing.
     - Conflict detection: concurrent offline edits create a non-destructive `"<Title> (Conflict)"` copy.

---

## 3. Data Model (`src/types/models.ts`)

- **Folder**: `{ id, name, driveFolderId?, createdAt, updatedAt, deletedAt? }`
- **Document**: `{ id, title, folderId, tags, pageIds, ocrFullText, createdAt, updatedAt, deletedAt?, syncStatus, driveFileId?, driveMetaFileId?, lastSyncedAt? }`
- **Page**: `{ id, documentId, orderIndex, originalUri, processedUri, width, height, quad?, rotation, filter, brightness, contrast, ocrText, ocrBlocks, annotations, driveImageFileId?, updatedAt }`
- **SavedSignature**: `{ id, name, svgPathData, pngUri, width, height, createdAt }`
- **SyncOperation**: `{ id, entityType, entityId, action, payloadJson, createdAt, attempts }`
- **AppSettings**: `{ theme, defaultFilter, defaultPageSize, defaultQuality, autoOcr, lastSyncAt? }`

---

## 4. Build & Distribution

- **Web PWA**: `pnpm build:web` runs `npx expo export --platform web`, injects `manifest.json` + service worker registration, and generates `dist/sw.js` with `workbox-cli`.
- **Android APK**:
  - **GitHub Actions** (`.github/workflows/build.yml`): runs `tsc --noEmit`, `vitest`, `build:web`, and builds Android APK via `expo prebuild --platform android` + Gradle.
  - **Docker Local Builder** (`docker/Dockerfile.android` + `scripts/build-apk-docker.sh`): containerized JDK 17 + Android SDK + Node 22 + pnpm build producing a sideloadable APK locally.
