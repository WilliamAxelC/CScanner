import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseUrl = (process.env.EXPO_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return {
    ...config,
    name: config.name ?? 'CScanner',
    slug: config.slug ?? 'cscanner',
    experiments: {
      ...(config.experiments ?? {}),
      typedRoutes: true,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
