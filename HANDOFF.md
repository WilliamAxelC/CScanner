# CScanner Handoff

## Last updated
- **Date**: 2026-11-27
- **Agent / Model**: Claude Code (Opus 5.5)
- **Branch @ Commit**: `main`, package-id rename committed locally on top of `7498fc7`, not pushed

## Current state
- **Version live**: `1.1.0` (`versionCode: 2`, package `com.cscanner.app`). Next release 1.1.1 moves to `dev.cuang.cscanner` (see In progress).
- **Live Web PWA**: `https://cuang.dev/projects/cscanner/` (`HTTP/2 200`, Workbox offline precache active).
- **Live APK Download & Update Feed**:
  - `https://cuang.dev/projects/cscanner/download/` (`HTTP/2 200`)
  - `https://cuang.dev/projects/cscanner/download/version.json` (`HTTP/2 200`, structured `apk` metadata)
  - `https://cuang.dev/projects/cscanner/download/cscanner-1.1.0.apk` (`HTTP/2 200`, `19,877,120` bytes / `18.96 MB`, SHA-256 `6f9c2a57b3059b7c52a6a104dd98629655c6ee9e0b0cfb7fded1ab9e86bff558`)
- **CI Release Build**: GitHub Actions run `45420238023` (`verify-and-web` + `android-apk`) passed:
  - Kotlin `:cscanner-mlkit:testDebugUnitTest` passed (5 JUnit test suites including pure-JVM URI/path confinement and SHA-256 updater helpers).
  - `arm64-v8a` only, compressed `.so`, R8 keep rules verified, `apksigner` v2 verified.
  - Android manifest verified: `allowBackup=false`, `usesCleartextTraffic=false`, `REQUEST_INSTALL_PACKAGES` present (used solely by the in-app SHA-256 + package-verified APK self-updater), zero `RECORD_AUDIO`.
- **Production Features Shipped**:
  - `app/accessibility.tsx`: Independent text scaling (`0.9`, `1.0`, `1.15`, `1.3`), High Contrast WCAG AAA palettes, Reduce Motion synced with OS preference, Confirm Before Delete toggle, live preview, Android Accessibility Settings shortcut.
  - `app/app-info.tsx`, `src/components/UpdateSheet.tsx`, `src/services/updates/`: Version/build card, once-daily automatic Android update checks (`version.json`) + dismissible update banner (`testID="update-banner"` on `app/index.tsx`), in-app APK downloader with progress bar, SHA-256 + `dev.cuang.cscanner` `versionCode` verification, `FileProvider` package-installer handoff (`modules/cscanner-mlkit/`), install-permission restart resume, vault storage breakdown, cache cleanup, sanitized diagnostics viewer/copier, and Open Source Licenses.
  - `app/report.tsx`: Bug Report / Feature Request composer opening pre-filled GitHub Issues (`https://github.com/WilliamAxelC/CScanner/issues/new`) with clipboard Markdown fallback and opt-in sanitized diagnostics preview.
  - `app/privacy.tsx`: Transparent disclosure of local vault storage and every optional outbound network call.
  - `app/settings.tsx`, `ErrorBoundary.tsx`, `ConfirmDialog.tsx`: Grouped production Settings hub, confirmation dialogs before deletes, and typed `ERASE` local vault wipe.
  - Security remediations across PDF/JPEG redactions, Drive sync manifest validation/conflict isolation, memory-only web OAuth tokens, deep-link prototype safety, native Kotlin confinement/OOM guards, and origin nginx security headers (`SECURITY_AUDIT.md`).

## In progress
- **1.1.1 (versionCode 3): package id `dev.cuang.cscanner`** (was `com.cscanner.app`). Committed locally, not pushed or released. The live site still serves 1.1.0.
  - Release: push `main` plus tag `v1.1.1` (CI builds the APK), download the artifact, `node scripts/generate-download-page.mjs`, `pnpm build:web:cuang`, `./scripts/deploy-cuang.sh`.
  - For this one release, drop `apk`, `downloadUrl`, `sha256` and `sizeBytes` from the published `version.json`. 1.1.0 then opens the download page instead of downloading an APK its package check would reject. Put them back from 1.1.2 on.

## Next steps
- Optional: test on physical Android device to exercise native ML Kit scanning, "Install unknown apps" flow, and TalkBack end-to-end.

## Waiting on the user
- Repository owner optional setup: configure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for Google Drive OAuth.
- Optional infra check outside repo: upstream Express reverse proxy in front of `projects-cuang-nginx` (`port 8095`) currently preserves `Permissions-Policy`, `Referrer-Policy`, and `X-Content-Type-Options` while omitting origin `Content-Security-Policy` and `X-Frame-Options` headers on public `https://cuang.dev`.

## Build, test, deploy
- Typecheck: `pnpm exec tsc --noEmit` (passed, 0 errors)
- Unit tests: `pnpm test` (`vitest run`: 6 files, 32 tests passed)
- Web PWA export (`cuang.dev` subpath): `pnpm build:web:cuang`
- Local Web E2E: `pnpm test:e2e` (10 flows passed, 0 console/page/request errors)
- Live Web E2E: `E2E_URL=https://cuang.dev/projects/cscanner/ pnpm test:e2e` (10 flows passed, 0 errors)
- Generate download page (after downloading CI APK): `node scripts/generate-download-page.mjs`
- Deploy to `docker-host` nginx (`projects-cuang-nginx`): `./scripts/deploy-cuang.sh`

## Gotchas
- **Release signing (from 1.1.1):** CI re-signs the APK with CScanner's private key from the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEY_PASS` and `ANDROID_KEY_ALIAS` (`cscanner`) secrets. Certificate SHA-256 `7F:4D:81:EC:2D:50:8A:9F:3B:BC:8B:16:DF:5E:CF:3D:AA:30:71:48:4A:BD:04:0D:1D:93:31:45:49:D9:60:A2`. The keystore itself is kept privately outside the repo (ask the user). Losing it means users must reinstall to update. 1.1.0 and older were signed with the public Android debug key.
- **Metro `ExponentConstants` cache**: `scripts/build-pwa.mjs` runs `npx expo export --platform web --clear` because Metro caches serialized `app.json` manifest values across rebuilds.
- **No local Android SDK/JDK**: Never install Android SDK locally or run Gradle on `docker-host` (2 GiB RAM); always build Android APKs via `.github/workflows/build.yml`.
- **Android JVM unit tests**: Do not call `android.net.Uri.parse` inside pure companion helpers tested under `:cscanner-mlkit:testDebugUnitTest` without Robolectric; use pure Kotlin/Java URI parsing (`parseLocalOrContentUri`).
- **Playwright `export.tsx` switches**: `scripts/e2e-web.mjs` toggles PDF encryption via the second visible Switch on `ExportScreen`; preserve switch ordering.
- **Public reverse proxy headers**: `projects-cuang-nginx` emits CSP/XFO/nosniff/Referrer-Policy/Permissions-Policy on port `8095`, but the upstream `portfolio-web` Express proxy in front of Cloudflare strips `Content-Security-Policy` and `X-Frame-Options` from responses at `https://cuang.dev/projects/*`.
