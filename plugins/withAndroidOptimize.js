const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');

const KEEP_MARKER = '# cscanner-mlkit keep rules';
const KEEP_RULES = `
${KEEP_MARKER}
-keep class com.cscanner.mlkit.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_document_scanner.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_text_common.** { *; }
-keep class com.google.android.gms.internal.mlkit_common.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
`;

function setGradleProperty(list, key, value) {
  const next = list.filter(
    (item) => !(item.type === 'property' && item.key === key),
  );
  next.push({ type: 'property', key, value });
  return next;
}

module.exports = function withAndroidOptimize(config) {
  config = withAndroidManifest(config, (cfg) => {
    const mainApp = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    mainApp.$['android:allowBackup'] = 'false';
    mainApp.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });

  config = withGradleProperties(config, (cfg) => {
    let props = cfg.modResults;
    props = setGradleProperty(props, 'reactNativeArchitectures', 'arm64-v8a');
    props = setGradleProperty(props, 'expo.useLegacyPackaging', 'true');
    props = setGradleProperty(props, 'android.enableMinifyInReleaseBuilds', 'true');
    props = setGradleProperty(props, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    props = setGradleProperty(props, 'expo.gif.enabled', 'false');
    props = setGradleProperty(props, 'expo.webp.enabled', 'false');
    props = setGradleProperty(props, 'expo.webp.animated', 'false');
    cfg.modResults = props;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (!contents.includes('abiFilters "arm64-v8a"')) {
      contents = contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a"\n        }`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const proguardPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      if (fs.existsSync(proguardPath)) {
        const existing = fs.readFileSync(proguardPath, 'utf8');
        if (!existing.includes(KEEP_MARKER)) {
          fs.writeFileSync(proguardPath, existing + KEEP_RULES, 'utf8');
        }
      }
      return cfg;
    },
  ]);

  return config;
};
