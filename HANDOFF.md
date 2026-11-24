# CScanner Handoff

## Last updated
- **Date**: 2026-11-24
- **Agent / Model**: Antigravity (Execution phase)
- **Branch @ Commit**: `main` (uncommitted `v1.1.0` changes on top of `c956a26`)

## Current state
- Version bumped to `1.1.0` (`versionCode: 2`, package `com.cscanner.app`).
- Implemented production Android & Web UX upgrades:
  - `app/accessibility.tsx`: Independent text scaling (`0.9`, `1.0`, `1.15`, `1.3`), WCAG AAA High Contrast light/dark palettes, Reduce Motion toggle synced with OS Accessibility, Confirm Before Delete toggle, live preview, and Android Accessibility Settings launcher.
  - `app/app-info.tsx`, `src/components/UpdateSheet.tsx`, `src/services/updates/`: Version & build readout, once-daily automatic Android update checks against `cuang.dev/projects/cscanner/download/version.json`, dismissible update banner on Home (`app/index.tsx`), in-app APK download + SHA-256 + `com.cscanner.app` `versionCode` verification + `FileProvider` package-installer handoff (`modules/cscanner-mlkit/`), install-permission restart resume, local storage vault stats, sanitized diagnostics, and Open Source Licenses.
  - `app/report.tsx`: Bug Report / Feature Request composer with inline validation, privacy notice, sanitized diagnostics preview, pre-filled GitHub Issue launcher (`https://github.com/WilliamAxelC/CScanner/issues/new`), and Markdown clipboard fallback.
  - `app/privacy.tsx`: Plain-English policy documenting local storage and every optional outbound network endpoint.
  - `app/settings.tsx`: Reorganized into production grouped sections with live feedback, delete confirmations, and typed `ERASE` local wipe modal.
  - `ErrorBoundary.tsx` & `ConfirmDialog.tsx`: Root render boundary and reusable themed confirmation dialogs.
- Completed Cloudflare 6-phase security audit (`/home/agent/security-audit-skill/CScanner/run-1/`) and remediated all 6 confirmed vulnerabilities plus hardened native Android, CI, and deployment controls (details in `SECURITY_AUDIT.md`).

## In progress
- Verifying `build:web:cuang && test:e2e` locally (`task-938`).
- Pending: git commit & push -> GitHub Actions `verify-and-web` & `android-apk` build -> APK artifact download -> `generate-download-page.mjs` -> `./scripts/deploy-cuang.sh` -> live curl & Playwright verification.

## Next steps
1. Verify local Playwright 10-step E2E passes cleanly.
2. Push commit to `origin main`, wait for CI green (Kotlin unit tests, APK < 35 MB, `arm64-v8a`, `allowBackup=false`, zero `RECORD_AUDIO`).
3. Download APK artifact, regenerate download page (`version.json` + HTML), deploy to `https://cuang.dev/projects/cscanner/`, and run live header & Playwright checks.

## Waiting on the user
- Repository owner optional setup: configure persistent `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASS` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASS` GitHub Secrets (without them CI falls back to an ephemeral signing keystore) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for Google Drive OAuth.

## Build, test, deploy
- Typecheck: `pnpm exec tsc --noEmit`
- Unit tests: `pnpm test`
- Web PWA export (`cuang.dev` subpath): `pnpm build:web:cuang`
- Web E2E (local dist): `pnpm test:e2e`
- Live E2E: `E2E_URL=https://cuang.dev/projects/cscanner/ pnpm test:e2e`
- Generate download page (after downloading CI APK): `node scripts/generate-download-page.mjs`
- Deploy to `docker-host` nginx (`projects-cuang-nginx`): `./scripts/deploy-cuang.sh`

## Gotchas
- **Metro `ExponentConstants` cache**: `scripts/build-pwa.mjs` runs `npx expo export --platform web --clear` because Metro caches serialized `app.json` manifest values across rebuilds.
- **No local Android SDK/JDK**: Never install Android SDK locally or run Gradle on `docker-host` (2 GiB RAM); always build Android APKs via `.github/workflows/build.yml`.
- **Nginx nested `add_header` inheritance**: Every nested `location` block inside `scripts/deploy-cuang.sh` repeats security headers explicitly so parent CSP/XFO/nosniff headers are never dropped.
- **Cloudflare Web Analytics beacon**: `scripts/deploy-cuang.sh` allows `https://static.cloudflareinsights.com` in `script-src` and `https://cloudflareinsights.com` in `connect-src` so live `cuang.dev` loads cleanly with zero CSP errors.
- **Playwright `export.tsx` switches**: `scripts/e2e-web.mjs` toggles PDF encryption via the second visible Switch on `ExportScreen`; preserve switch ordering.
