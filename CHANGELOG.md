# Changelog

All notable changes to CScanner are documented in this file using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) formatting.

## [Unreleased]

## [1.1.0] - 2026-11-24

### Added
- **Accessibility Settings (`app/accessibility.tsx`)**: Independent app text scale (`Compact 90%`, `Default 100%`, `Large 115%`, `Largest 130%`), high-contrast light/dark palettes, reduce-motion toggle synced with OS reduce-motion preference, Confirm Before Delete toggle, live preview card, and Android Accessibility Settings shortcut.
- **App Info & In-App Auto-Updater (`app/app-info.tsx`, `src/components/UpdateSheet.tsx`, `src/services/updates/updateChecker.ts`, `src/services/updates/appUpdate.ts`, `modules/cscanner-mlkit/`)**: Version/build metadata (`1.1.0` / `versionCode 2`), once-daily automatic Android update checks (`version.json`) + dismissible update banner on Home (`app/index.tsx`), in-app APK downloader with progress bar, SHA-256 + package verification (`com.cscanner.app` + `versionCode`), Android `REQUEST_INSTALL_PACKAGES` permission handling with restart resume, stale APK cleanup, storage breakdown, cache cleanup, sanitized diagnostics viewer/copier, and Open Source Licenses list.
- **Bug Reports & Feature Requests (`app/report.tsx`, `src/services/feedback/reportBuilder.ts`)**: Structured Bug Report / Feature Request form opening pre-filled GitHub Issues (`https://github.com/WilliamAxelC/CScanner/issues/new`) with clipboard Markdown fallback, inline validation alerts, and opt-in sanitized diagnostics preview.
- **Privacy Transparency Screen (`app/privacy.tsx`)**: Plain-English breakdown of local device storage, every optional external network endpoint, and what never leaves the device.
- **Production Controls (`src/components/ErrorBoundary.tsx`, `src/components/ConfirmDialog.tsx`, `src/services/diagnostics/errorLog.ts`)**: React ErrorBoundary fallback, themed confirmation dialogs before destructive actions, and typed `ERASE` confirmation before full local data wipe.
- **Tests**: Security validation tests (`src/__tests__/security.test.ts`), diagnostics/updates/report tests (`src/__tests__/diagnosticsAndUpdates.test.ts`), in-app updater tests (`src/__tests__/appUpdate.test.ts`), redaction/password PDF export tests, Drive manifest security tests, Kotlin bridge & APK updater security tests, and Playwright E2E Flow 10 (`scripts/e2e-web.mjs`).

### Changed
- Bumped version to `1.1.0` and Android `versionCode` to `2` across `package.json`, `app.json`, and `scripts/generate-download-page.mjs`.
- Reorganized `app/settings.tsx` into grouped sections (`Appearance & Accessibility`, `Scan & Export Defaults`, `Saved Signatures`, `Local Storage & Google Drive Sync`, `Support & Feedback`, `About`) with live status feedback.
- Polished semantic accessibility roles, labels, states, and >=44-48dp hit targets across `app/index.tsx`, `app/scan.tsx`, `app/doc/[id].tsx`, `app/doc/[id]/edit/[pageId].tsx`, `app/doc/[id]/ocr.tsx`, `app/doc/[id]/export.tsx`, `app/id-card.tsx`, `src/components/ScanFab.tsx`, and `src/components/DocumentCard.tsx`.

### Fixed
- Cleared Metro transform cache on Web PWA export (`--clear`) and preferred `app.json` metadata in `getInstalledAppInfo()` so Web PWA renders the current app version instead of stale cached `ExponentConstants` strings.

### Security
- Remediated **HIGH** PDF/JPEG redaction bypass by pixel-burning redaction boxes (`processor.web.ts`, `CScannerMlkitModule.kt` `redactImage`) and stripping overlapping OCR text blocks (`filterRedactedOcrBlocks`).
- Remediated **HIGH** Google Drive sync manifest traversal, `manifest.id` mismatch bypass, and cross-document page ID hijacking (`validateRemoteManifest`, `assertSafeAssetId`, `isManagedImageUri`, `syncEngine.ts`).
- Remediated **HIGH** Web OAuth bearer token exposure by moving tokens strictly to volatile memory, clearing legacy `localStorage` entries, and revoking tokens remotely on sign-out (`googleAuth.ts`).
- Remediated deep-link prototype lookup crashes (`getPagesForDoc`), gated `/scan` auto-launch via `fromApp: '1'`, prevented Drive multipart MIME header injection (`assertValidMimeType`), escaped Drive queries (`escapeDriveQueryValue`), rejected blank PDF passwords, bounded Android bitmap decode (`inSampleSize`), clamped `NaN` quad coords, disabled Android `allowBackup` / `usesCleartextTraffic` / `RECORD_AUDIO`, extracted external `sw-register.js`, and enforced nginx CSP & security headers (`scripts/deploy-cuang.sh`).
