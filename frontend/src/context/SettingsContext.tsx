import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { TimeFormat } from '../utils/time';

type Theme = 'light' | 'dark';
type CalendarViewMode = 'rolling' | 'weekly';

interface SettingsContextType {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
  theme: Theme;
  toggleTheme: () => void;
  calendarViewMode: CalendarViewMode;
  setCalendarViewMode: (mode: CalendarViewMode) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  timeFormat: '12h',
  setTimeFormat: () => {},
  theme: 'light',
  toggleTheme: () => {},
  calendarViewMode: 'rolling',
  setCalendarViewMode: () => {},
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

  useEffect(() => {
    api.getSettings()
      .then(s => setTimeFormat(s.timeFormat === '24h' ? '24h' : '12h'))
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat, theme, toggleTheme, calendarViewMode, setCalendarViewMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
