import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { TimeFormat } from '../utils/time';

type Theme = 'light' | 'dark';

interface SettingsContextType {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
  theme: Theme;
  toggleTheme: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  timeFormat: '12h',
  setTimeFormat: () => {},
  theme: 'light',
  toggleTheme: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('12h');

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Keep data-theme attribute in sync with state
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    api.getSettings()
      .then(s => setTimeFormat(s.timeFormat === '24h' ? '24h' : '12h'))
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, theme, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
