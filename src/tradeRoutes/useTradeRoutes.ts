import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTradeMarket, getCachedTradeMarket } from './tradeRouteService';
import type { TradeRoutesState } from './types';

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function useTradeRoutes(): TradeRoutesState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<TradeRoutesState>(() => {
    const cached = getCachedTradeMarket();
    return { snapshot: cached, isLoading: !cached, error: null, usingCache: Boolean(cached) };
  });
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await fetchTradeMarket();
      if (id !== refreshId.current) return;
      setState({ snapshot, isLoading: false, error: null, usingCache: false });
    } catch (error) {
      if (id !== refreshId.current) return;
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh trade market data.',
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
