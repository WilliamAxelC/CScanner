# CScanner Handoff

## Last updated
- **Date**: 2026-11-27
- **Agent / Model**: Claude Code (Opus 5.5)
- **Branch @ Commit**: `main` (pushed; tag `v1.1.1` @ `7bdf75d`)

## Current state
- **Version live**: `1.1.1` (`versionCode: 3`, package `dev.cuang.cscanner`, signed with CScanner's private key; APK SHA-256 `08367d21…1f5d`). Released 2026-11-27 from CI run `45951965329`. Before that 1.1.0 (`com.cscanner.app`, public debug key).
- **1.1.1 is a new app on phones** (new package id and key), so its `version.json` was generated with `NO_IN_APP_APK=1`: no APK fields, and 1.1.0's Update button opens the download page. **Generate 1.1.2 without `NO_IN_APP_APK`** so in-app updates work again, and replace the hard-coded `releaseNotes` in `scripts/generate-download-page.mjs`.
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
- None. 1.1.1 is built, deployed and passes the live web E2E (10 flows).

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
- Generate download page (after downloading the CI APK with `gh run download <run> -n cscanner-android-apk -D build-output`): `node scripts/generate-download-page.mjs` (prefix `NO_IN_APP_APK=1` only for a release with a new package id or key)
- Deploy to `docker-host` nginx (`projects-cuang-nginx`): `./scripts/deploy-cuang.sh`. Its second half rewrites the root-owned nginx.conf; when only files changed, the first half (tar to the host copy, then `docker cp`) is enough, which is what 1.1.1 did.

## Gotchas
- **Release signing (from 1.1.1):** CI re-signs the APK with CScanner's private key from the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEY_PASS` and `ANDROID_KEY_ALIAS` (`cscanner`) secrets. Certificate SHA-256 `7F:4D:81:EC:2D:50:8A:9F:3B:BC:8B:16:DF:5E:CF:3D:AA:30:71:48:4A:BD:04:0D:1D:93:31:45:49:D9:60:A2`. The keystore itself is kept privately outside the repo (ask the user). Losing it means users must reinstall to update. 1.1.0 and older were signed with the public Android debug key.
- **Metro `ExponentConstants` cache**: `scripts/build-pwa.mjs` runs `npx expo export --platform web --clear` because Metro caches serialized `app.json` manifest values across rebuilds.
- **No local Android SDK/JDK**: Never install Android SDK locally or run Gradle on `docker-host` (2 GiB RAM); always build Android APKs via `.github/workflows/build.yml`.
- **Android JVM unit tests**: Do not call `android.net.Uri.parse` inside pure companion helpers tested under `:cscanner-mlkit:testDebugUnitTest` without Robolectric; use pure Kotlin/Java URI parsing (`parseLocalOrContentUri`).
- **Playwright `export.tsx` switches**: `scripts/e2e-web.mjs` toggles PDF encryption via the second visible Switch on `ExportScreen`; preserve switch ordering.
- **Public reverse proxy headers**: `projects-cuang-nginx` emits CSP/XFO/nosniff/Referrer-Policy/Permissions-Policy on port `8095`, but the upstream `portfolio-web` Express proxy in front of Cloudflare strips `Content-Security-Policy` and `X-Frame-Options` from responses at `https://cuang.dev/projects/*`.
