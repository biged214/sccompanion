import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGameplaySnapshot } from './gameplayService';
import type { GameplayFilters, GameplaySnapshot } from './types';

export function useGameplay(filters: GameplayFilters) {
  const [snapshot, setSnapshot] = useState<GameplaySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async (quiet = false) => {
    const currentRequest = ++requestId.current;
    if (!quiet) setIsLoading(true);
    try {
      const result = await fetchGameplaySnapshot(filters);
      if (requestId.current !== currentRequest) return;
      setSnapshot(result);
      setError(null);
    } catch (reason) {
      if (requestId.current !== currentRequest) return;
      setError(reason instanceof Error ? reason.message : 'Could not load gameplay sessions.');
    } finally {
      if (requestId.current === currentRequest) setIsLoading(false);
    }
  }, [filters.category, filters.limit, filters.search, filters.sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(true), 15_000);
    if (!window.__TAURI_INTERNALS__) return () => window.clearInterval(interval);
    let removeListener: (() => void) | undefined;
    let refreshTimeout: number | undefined;
    void listen('gameplay-updated', () => {
      window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => void refresh(true), 750);
    }).then((unlisten) => { removeListener = unlisten; });
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(refreshTimeout);
      removeListener?.();
    };
  }, [refresh]);

  return { snapshot, isLoading, error, refresh };
}
