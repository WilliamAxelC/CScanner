const basePath = (process.env.EXPO_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

module.exports = {
  globDirectory: 'dist/',
  globPatterns: [
    '**/*.{html,js,css,json,png,svg,ico,woff2,wasm}',
  ],
  globIgnores: [
    'download/**',
    '**/*.apk',
  ],
  maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
  swDest: 'dist/sw.js',
  ...(basePath ? { modifyURLPrefix: { '': `${basePath}/` } } : {}),
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: `${basePath}/index.html`,
  navigateFallbackDenylist: [
    /^\/api\//,
    /\/download(\/|$)/,
    /\.apk$/i,
  ],
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'tesseract-assets',
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: 60 * 60 * 24 * 14,
        },
      },
    },
  ],
};
