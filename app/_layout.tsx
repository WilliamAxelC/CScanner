import 'react-native-get-random-values';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { UpdateSheet } from '../src/components/UpdateSheet';
import {
  cleanUpInstalledUpdates,
  configureAppUpdatePersistence,
  resumePendingUpdate,
} from '../src/services/updates/appUpdate';
import {
  configureUpdatePersistence,
  useUpdateStore,
} from '../src/services/updates/updateChecker';
import { useAppStore } from '../src/store/useAppStore';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

function RootNavigator() {
  const initialized = useAppStore((s) => s.initialized);
  const initApp = useAppStore((s) => s.initApp);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    configureUpdatePersistence(updateSettings);
    configureAppUpdatePersistence(updateSettings);
    initApp();
  }, [initApp, updateSettings]);

  useEffect(() => {
    if (!initialized) return;
    const currentSettings = useAppStore.getState().settings;
    useUpdateStore.getState().hydrate(currentSettings);
    void resumePendingUpdate(currentSettings.pendingUpdateVersionCode);
    void useUpdateStore.getState().check();
    void cleanUpInstalledUpdates();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void useUpdateStore.getState().check();
      }
    });
    return () => sub.remove();
  }, [initialized]);

  if (!initialized) {
    return (
      <View
        style={[
          styles.bootScreen,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.bootText, { color: colors.textSecondary }]}>
          Loading CScanner...
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <UpdateSheet />
    </>
  );
}

export default function RootLayout() {
  const settings = useAppStore((s) => s.settings);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider
          mode={settings.theme}
          highContrast={settings.highContrast}
          fontScale={settings.fontScale}
          reduceMotion={settings.reduceMotion}
        >
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bootScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bootText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
