import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseUrl = (process.env.EXPO_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const existingPlugins = config.plugins ?? [];
  const hasOptimize = existingPlugins.some(
    (p) => p === './plugins/withAndroidOptimize',
  );

  return {
    ...config,
    name: config.name ?? 'CScanner',
    slug: config.slug ?? 'cscanner',
    plugins: hasOptimize
      ? existingPlugins
      : [...existingPlugins, './plugins/withAndroidOptimize'],
    experiments: {
      ...(config.experiments ?? {}),
      typedRoutes: true,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
