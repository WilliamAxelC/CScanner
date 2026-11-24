import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_PALETTE, LIGHT_PALETTE, type ColorPalette } from './colors';
import type { ThemeMode } from '../types/models';

interface ThemeContextValue {
  colors: ColorPalette;
  mode: ThemeMode;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LIGHT_PALETTE,
  mode: 'system',
  isDark: false,
});

export function ThemeProvider({
  mode,
  children,
}: {
  mode: ThemeMode;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedDark =
      mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
    return {
      colors: resolvedDark ? DARK_PALETTE : LIGHT_PALETTE,
      mode,
      isDark: resolvedDark,
    };
  }, [mode, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
