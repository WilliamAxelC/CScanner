export interface ColorPalette {
  isDark: boolean;
  highContrast: boolean;
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
  highContrast: false,
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  border: '#CBD5E1',
  primary: '#0D9488',
  primarySoft: '#CCFBF1',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warning: '#B45309',
  success: '#15803D',
  overlay: 'rgba(15, 23, 42, 0.6)',
};

export const DARK_PALETTE: ColorPalette = {
  isDark: true,
  highContrast: false,
  background: '#0B1120',
  surface: '#111827',
  surfaceElevated: '#1E293B',
  surfaceMuted: '#1F2937',
  text: '#F8FAFC',
  textSecondary: '#E2E8F0',
  textMuted: '#94A3B8',
  border: '#334155',
  primary: '#14B8A6',
  primarySoft: '#134E4A',
  onPrimary: '#042F2E',
  danger: '#F87171',
  dangerSoft: '#450A0A',
  warning: '#FBBF24',
  success: '#4ADE80',
  overlay: 'rgba(2, 6, 23, 0.78)',
};

export const HIGH_CONTRAST_LIGHT_PALETTE: ColorPalette = {
  isDark: false,
  highContrast: true,
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#E2E8F0',
  text: '#000000',
  textSecondary: '#0F172A',
  textMuted: '#1E293B',
  border: '#0F172A',
  primary: '#005A50',
  primarySoft: '#CCFBF1',
  onPrimary: '#FFFFFF',
  danger: '#991B1B',
  dangerSoft: '#FEE2E2',
  warning: '#78350F',
  success: '#14532D',
  overlay: 'rgba(0, 0, 0, 0.78)',
};

export const HIGH_CONTRAST_DARK_PALETTE: ColorPalette = {
  isDark: true,
  highContrast: true,
  background: '#000000',
  surface: '#090D16',
  surfaceElevated: '#111827',
  surfaceMuted: '#1E293B',
  text: '#FFFFFF',
  textSecondary: '#F8FAFC',
  textMuted: '#E2E8F0',
  border: '#94A3B8',
  primary: '#2DD4BF',
  primarySoft: '#042F2E',
  onPrimary: '#000000',
  danger: '#FCA5A5',
  dangerSoft: '#450A0A',
  warning: '#FDE047',
  success: '#86EFAC',
  overlay: 'rgba(0, 0, 0, 0.86)',
};
