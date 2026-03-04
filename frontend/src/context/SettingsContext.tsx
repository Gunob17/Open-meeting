import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import { TimeFormat } from '../utils/time';

interface SettingsContextType {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  timeFormat: '12h',
  setTimeFormat: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('12h');

  useEffect(() => {
    api.getSettings()
      .then(s => setTimeFormat(s.timeFormat === '24h' ? '24h' : '12h'))
      .catch(() => {});
  }, []);

  return (
    <SettingsContext.Provider value={{ timeFormat, setTimeFormat }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
