
import React, { createContext, useContext, useEffect, useState } from 'react';

export interface AppTheme {
  appName: string;
  primaryHex: string;
  sidebarHex: string;
  presetId: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  primaryHex: string;
  sidebarHex: string;
}

interface ThemeContextValue {
  theme: AppTheme;
  updateTheme: (partial: Partial<AppTheme>) => void;
  presets: ThemePreset[];
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'indigo',  name: 'Índigo',   primaryHex: '#4f46e5', sidebarHex: '#0f172a' },
  { id: 'green',   name: 'Verde',    primaryHex: '#16a34a', sidebarHex: '#052e16' },
  { id: 'blue',    name: 'Azul',     primaryHex: '#2563eb', sidebarHex: '#0f172a' },
  { id: 'violet',  name: 'Violeta',  primaryHex: '#7c3aed', sidebarHex: '#1e1b4b' },
  { id: 'teal',    name: 'Teal',     primaryHex: '#0d9488', sidebarHex: '#042f2e' },
  { id: 'rose',    name: 'Rojo',     primaryHex: '#e11d48', sidebarHex: '#0f172a' },
];

const DEFAULT_THEME: AppTheme = {
  appName: 'ERP Veterinaria',
  primaryHex: '#4f46e5',
  sidebarHex: '#0f172a',
  presetId: 'indigo',
};

const STORAGE_KEY = 'erp-theme-v1';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function darken(hex: string, factor = 0.82): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return '#' + [rgb.r, rgb.g, rgb.b]
    .map(c => Math.round(c * factor).toString(16).padStart(2, '0'))
    .join('');
}

function injectThemeCSS(theme: AppTheme) {
  const rgb = hexToRgb(theme.primaryHex);
  if (!rgb) return;
  const { r, g, b } = rgb;
  const darkHex = darken(theme.primaryHex);

  const css = `
/* erp-theme-override */
.bg-indigo-600 { background-color: ${theme.primaryHex} !important; }
.hover\\:bg-indigo-600:hover { background-color: ${theme.primaryHex} !important; }
.bg-indigo-700 { background-color: ${darkHex} !important; }
.hover\\:bg-indigo-700:hover { background-color: ${darkHex} !important; }
.text-indigo-600 { color: ${theme.primaryHex} !important; }
.text-indigo-500 { color: ${theme.primaryHex} !important; }
.text-indigo-400 { color: rgba(${r},${g},${b},0.8) !important; }
.bg-indigo-50 { background-color: rgba(${r},${g},${b},0.07) !important; }
.hover\\:bg-indigo-50:hover { background-color: rgba(${r},${g},${b},0.07) !important; }
.hover\\:text-indigo-400:hover { color: rgba(${r},${g},${b},0.8) !important; }
.hover\\:text-indigo-600:hover { color: ${theme.primaryHex} !important; }
.focus\\:ring-indigo-500:focus { --tw-ring-color: rgba(${r},${g},${b},0.5) !important; }
.bg-indigo-600\\/10 { background-color: rgba(${r},${g},${b},0.1) !important; }
.bg-indigo-600\\/20 { background-color: rgba(${r},${g},${b},0.2) !important; }
.border-indigo-500\\/20 { border-color: rgba(${r},${g},${b},0.2) !important; }
.border-indigo-500\\/30 { border-color: rgba(${r},${g},${b},0.3) !important; }
.shadow-indigo-600\\/20 { --tw-shadow-color: rgba(${r},${g},${b},0.2) !important; box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow) !important; }
.shadow-indigo-900\\/40 { --tw-shadow-color: rgba(${r},${g},${b},0.4) !important; box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow) !important; }
.hover\\:border-indigo-500\\/20:hover { border-color: rgba(${r},${g},${b},0.2) !important; }
`;

  let styleEl = document.getElementById('erp-theme') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'erp-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  updateTheme: () => {},
  presets: THEME_PRESETS,
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return DEFAULT_THEME;
      const parsed = { ...DEFAULT_THEME, ...JSON.parse(saved) };
      const legacyAppName = ['ERP', 'Farmacia'].join(' ');
      if (parsed.appName === legacyAppName) parsed.appName = DEFAULT_THEME.appName;
      return parsed;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    injectThemeCSS(theme);
  }, [theme]);

  const updateTheme = (partial: Partial<AppTheme>) => {
    setTheme(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, updateTheme, presets: THEME_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
