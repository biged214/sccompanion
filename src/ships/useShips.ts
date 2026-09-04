import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchShipsSnapshot, getCachedShipsSnapshot } from './shipService';
import type { ShipsState } from './types';

const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

export function useShips(): ShipsState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<ShipsState>(() => {
    const cached = getCachedShipsSnapshot();
    return { snapshot: cached, isLoading: !cached, error: null, usingCache: Boolean(cached) };
  });
  const activeRefreshId = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = ++activeRefreshId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await fetchShipsSnapshot();
      if (activeRefreshId.current !== refreshId) return;
      setState({ snapshot, isLoading: false, error: null, usingCache: false });
    } catch (error) {
      if (activeRefreshId.current !== refreshId) return;
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh ship data.',
        usingCache: Boolean(current.snapshot)
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  return { ...state, refresh };
}
