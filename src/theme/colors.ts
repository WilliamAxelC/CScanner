export interface ColorPalette {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  success: string;
  overlay: string;
}

export const LIGHT_PALETTE: ColorPalette = {
  isDark: false,
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: '#E2E8F0',
  primary: '#0D9488',
  primarySoft: '#CCFBF1',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warning: '#D97706',
  success: '#16A34A',
  overlay: 'rgba(15, 23, 42, 0.55)',
};

export const DARK_PALETTE: ColorPalette = {
  isDark: true,
  background: '#0B1120',
  surface: '#111827',
  surfaceElevated: '#1E293B',
  surfaceMuted: '#1F2937',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  border: '#1E293B',
  primary: '#14B8A6',
  primarySoft: '#134E4A',
  onPrimary: '#042F2E',
  danger: '#F87171',
  dangerSoft: '#450A0A',
  warning: '#FBBF24',
  success: '#4ADE80',
  overlay: 'rgba(2, 6, 23, 0.72)',
};
