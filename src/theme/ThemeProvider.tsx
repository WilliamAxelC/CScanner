import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  DARK_PALETTE,
  HIGH_CONTRAST_DARK_PALETTE,
  HIGH_CONTRAST_LIGHT_PALETTE,
  LIGHT_PALETTE,
  type ColorPalette,
} from './colors';
import type { FontScalePreset, ThemeMode } from '../types/models';

interface ThemeContextValue {
  colors: ColorPalette;
  mode: ThemeMode;
  isDark: boolean;
  highContrast: boolean;
  fontScale: FontScalePreset;
  reduceMotion: boolean;
  osReduceMotion: boolean;
  scaleFont: (baseSize: number) => number;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LIGHT_PALETTE,
  mode: 'system',
  isDark: false,
  highContrast: false,
  fontScale: 1.0,
  reduceMotion: false,
  osReduceMotion: false,
  scaleFont: (baseSize) => baseSize,
});

export function ThemeProvider({
  mode,
  highContrast = false,
  fontScale = 1.0,
  reduceMotion = false,
  children,
}: {
  mode: ThemeMode;
  highContrast?: boolean;
  fontScale?: FontScalePreset;
  reduceMotion?: boolean;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [osReduceMotion, setOsReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (active) setOsReduceMotion(Boolean(enabled));
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        setOsReduceMotion(Boolean(enabled));
      },
    );

    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedDark =
      mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
    const colors = highContrast
      ? resolvedDark
        ? HIGH_CONTRAST_DARK_PALETTE
        : HIGH_CONTRAST_LIGHT_PALETTE
      : resolvedDark
        ? DARK_PALETTE
        : LIGHT_PALETTE;
    const clampedScale: FontScalePreset =
      fontScale === 0.9 || fontScale === 1.0 || fontScale === 1.15 || fontScale === 1.3
        ? fontScale
        : 1.0;

    return {
      colors,
      mode,
      isDark: resolvedDark,
      highContrast,
      fontScale: clampedScale,
      reduceMotion: Boolean(reduceMotion || osReduceMotion),
      osReduceMotion,
      scaleFont: (baseSize: number) => Math.round(baseSize * clampedScale),
    };
  }, [mode, systemScheme, highContrast, fontScale, reduceMotion, osReduceMotion]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
