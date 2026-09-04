import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGameplayStatus } from './gameplayService';
import type { TrackerStatus } from './types';

export function useGameplayStatus() {
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const timeout = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchGameplayStatus());
    } catch {
      // The full Live Sessions view reports detailed tracker errors.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    if (!window.__TAURI_INTERNALS__) return () => window.clearInterval(interval);
    let removeListener: (() => void) | undefined;
    void listen('gameplay-updated', () => {
      if (timeout.current != null) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => void refresh(), 750);
    }).then((unlisten) => { removeListener = unlisten; });
    return () => {
      window.clearInterval(interval);
      if (timeout.current != null) window.clearTimeout(timeout.current);
      removeListener?.();
    };
  }, [refresh]);

  return { status, refresh };
}
