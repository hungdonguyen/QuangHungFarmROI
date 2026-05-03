import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onQueueStatus } from '../api';

const LoaderContext = createContext();

export function LoaderProvider({ children }) {
  const [loadState, setLoadState] = useState({
    active: false, mode: null, current: 0, total: 0, skipped: 0,
    currentSkin: '', currentWear: '', currentCollection: '', currentRarity: '',
    startTime: null, etaSeconds: null,
  });
  const [cooldown, setCooldown] = useState(null);
  const abortRef = useRef(false);

  useEffect(() => {
    const unsub = onQueueStatus((status) => {
      if (status.type === 'cooldown') {
        setCooldown(status);
      } else if (status.type === 'resumed') {
        setCooldown(null);
      }
    });
    return unsub;
  }, []);

  return (
    <LoaderContext.Provider value={{ loadState, setLoadState, cooldown, setCooldown, abortRef }}>
      {children}
    </LoaderContext.Provider>
  );
}

export const useLoader = () => useContext(LoaderContext);
