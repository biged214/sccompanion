import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStatusSnapshot, getCachedStatusSnapshot } from './statusService';
import type { StatusState } from './types';

export function useStatusFeed(refreshIntervalMinutes = 5): StatusState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<StatusState>(() => {
    const cached = getCachedStatusSnapshot();
    return {
      snapshot: cached,
      isLoading: !cached,
      error: null,
      lastRefreshStartedAt: null,
      usingCache: Boolean(cached)
    };
  });
  const activeRefreshId = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = activeRefreshId.current + 1;
    activeRefreshId.current = refreshId;

    setState((current) => ({
      ...current,
      isLoading: true,
      error: null,
      lastRefreshStartedAt: new Date().toISOString()
    }));

    try {
      const snapshot = await fetchStatusSnapshot();
      if (activeRefreshId.current !== refreshId) {
        return;
      }

      setState({
        snapshot,
        isLoading: false,
        error: null,
        lastRefreshStartedAt: null,
        usingCache: false
      });
    } catch (error) {
      if (activeRefreshId.current !== refreshId) {
        return;
      }

      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh the RSI status feed.',
        lastRefreshStartedAt: null,
        usingCache: Boolean(current.snapshot)
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), refreshIntervalMinutes * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [refresh, refreshIntervalMinutes]);

  return { ...state, refresh };
}
