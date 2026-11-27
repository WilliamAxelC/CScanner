# CScanner

Ad-free, offline-first document scanner for **Android** and **Web PWA** replacing CamScanner.

## Features

- **Native Android Scanner + Web CV**: Uses Google ML Kit Document Scanner (`play-services-mlkit-document-scanner`) on Android via local Expo Module `modules/cscanner-mlkit`, and live camera / photo import + pure-TS auto-edge detection & 4-corner perspective warp on Web.
- **Multi-Page & Lossless Enhancement**: Reorder, rotate 90°, delete, append pages, re-crop corners, and apply non-destructive presets (`Original`, `Magic Color`, `Crisp B&W`, `Grayscale`, `Lighten`) plus Brightness/Contrast controls.
- **ID Card Mode**: Guided Front + Back capture composited onto one clean A4 portrait sheet.
- **On-Device Latin OCR**: ML Kit Text Recognition on Android, `tesseract.js` (`eng`) on Web. Powers instant full-text search (SQLite FTS5 on Android, IndexedDB on Web), copyable/editable OCR text, and invisible searchable PDF text layers.
- **Signatures & Annotations**: Reusable drawn signatures, customizable single/tiled text watermarks, and solid black/white redactions.
- **Flexible PDF & JPEG Export**: `Auto`, `A4`, or `Letter` page sizes; `Low`, `Medium`, or `High` compression; optional **AES-256 PDF password protection** (`@cantoo/pdf-lib`).
- **Offline-First Google Drive Sync (`drive.file`)**: Optional OAuth sync storing browsable PDFs in `My Drive/CScanner/` and lossless metadata/original images in `My Drive/CScanner/.cscanner-meta/` with conflict-safe merges. Works 100% locally offline if not signed in.

---

## Development & Verification

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm test
```

### Run Web / Build Offline PWA

```bash
pnpm web          # Interactive Expo Web dev server
pnpm build:web    # Builds static offline PWA bundle + service worker into dist/
```

To preview the built PWA locally:

```bash
python3 -m http.server 8080 --directory dist
```

---

## Building the Android APK

### Option 1: GitHub Actions (Recommended)

Push to `main` or push a release tag `v1.0.0`. The workflow at [.github/workflows/build.yml](.github/workflows/build.yml) verifies TypeScript, tests, and the Web PWA, then builds and uploads `CScanner-release.apk` (and attaches it to GitHub Releases on `v*` tags).

### Option 2: Local Docker Build

Requires Docker installed locally (no host Android SDK needed):

```bash
./scripts/build-apk-docker.sh
```

The signed sideloadable APK will be written to `build-output/CScanner-release.apk`.

---

## Optional: Setting Up Google Drive Sync (`drive.file`)

CScanner works 100% locally without any cloud configuration. To enable cross-device Google Drive sync:

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. Enable the **Google Drive API**.
3. Configure the **OAuth consent screen** (External, Testing or Production) and add the non-restricted scope:
   - `https://www.googleapis.com/auth/drive.file`
4. Under **APIs & Services → Credentials**, create OAuth 2.0 Client IDs:
   - **Web application** (for the Web PWA):
     - Add Authorized JavaScript origins (e.g. `http://localhost:8081`, `https://your-pwa-domain.example`).
     - Add Authorized redirect URIs matching your origin.
   - **Android** (for the APK):
     - Package name: `dev.cuang.cscanner`
     - SHA-1 signing certificate fingerprint of your keystore (`keytool -list -v -keystore ...`).
5. Copy `.env.example` to `.env` and fill in your IDs:

```bash
cp .env.example .env
```

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
```

For GitHub Actions builds, add those same variables as repository secrets (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`).
