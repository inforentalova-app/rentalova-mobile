export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  textLight: string;
  border: string;
  teal: string;
  inputBg: string;
};

export const lightColors: ThemeColors = {
  background: '#ffffff',
  card:       '#f9fafb',
  text:       '#111827',
  textLight:  '#6b7280',
  border:     '#e5e7eb',
  teal:       '#4b9c78',
  inputBg:    '#f9fafb',
};

export const darkColors: ThemeColors = {
  background: '#0f172a',
  card:       '#1e293b',
  text:       '#f1f5f9',
  textLight:  '#94a3b8',
  border:     '#334155',
  teal:       '#4b9c78',
  inputBg:    '#1e293b',
};

export type ThemePreference = 'system' | 'light' | 'dark';
