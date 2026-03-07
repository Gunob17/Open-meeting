import React, { createContext, useContext } from 'react';

interface TourContextValue {
  startTour: () => void;
}

const TourContext = createContext<TourContextValue>({ startTour: () => {} });

export function TourProvider({ children, startTour }: { children: React.ReactNode; startTour: () => void }) {
  return <TourContext.Provider value={{ startTour }}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  return useContext(TourContext);
}
