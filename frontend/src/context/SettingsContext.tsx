import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { TimeFormat } from '../utils/time';
import { changeLanguage as i18nChangeLanguage } from 'i18next';

type Theme = 'light' | 'dark';
type CalendarViewMode = 'rolling' | 'weekly';
export type Language = 'en' | 'da' | 'de' | 'fr' | 'it' | 'es';

interface SettingsContextType {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
  theme: Theme;
  toggleTheme: () => void;
  calendarViewMode: CalendarViewMode;
  setCalendarViewMode: (mode: CalendarViewMode) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  timeFormat: '12h',
  setTimeFormat: () => {},
  theme: 'light',
  toggleTheme: () => {},
  calendarViewMode: 'rolling',
  setCalendarViewMode: () => {},
  language: 'en',
  setLanguage: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(() => {
    const stored = localStorage.getItem('timeFormat');
    return stored === '24h' ? '24h' : '12h';
  });

  useEffect(() => {
    localStorage.setItem('timeFormat', timeFormat);
  }, [timeFormat]);

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

  const [calendarViewMode, setCalendarViewModeState] = useState<CalendarViewMode>(() => {
    const stored = localStorage.getItem('calendarViewMode');
    return stored === 'weekly' ? 'weekly' : 'rolling';
  });

  const setCalendarViewMode = (mode: CalendarViewMode) => {
    localStorage.setItem('calendarViewMode', mode);
    setCalendarViewModeState(mode);
  };

  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('language');
    const supported: Language[] = ['en', 'da', 'de', 'fr', 'it', 'es'];
    return supported.includes(stored as Language) ? (stored as Language) : 'en';
  });

  const setLanguage = (lang: Language) => {
    localStorage.setItem('language', lang);
    setLanguageState(lang);
    i18nChangeLanguage(lang);
  };

  useEffect(() => {
    api.getSettings()
      .then(s => setTimeFormat(s.timeFormat === '24h' ? '24h' : '12h'))
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, theme, toggleTheme, calendarViewMode, setCalendarViewMode, language, setLanguage }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
