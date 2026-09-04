import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPatchNotesSnapshot, getCachedPatchNotesSnapshot } from './patchNotesService';
import { saveCachedPatchNotes } from './cache';
import type { PatchNotesState } from './types';

export function usePatchNotes(refreshIntervalMinutes = 10): PatchNotesState & {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  isLoadingMore: boolean;
  hasMore: boolean;
} {
  const [state, setState] = useState<PatchNotesState>(() => {
    const cached = getCachedPatchNotesSnapshot();
    return {
      snapshot: cached,
      isLoading: !cached,
      error: null,
      usingCache: Boolean(cached)
    };
  });
  const activeRefreshId = useRef(0);
  const [nextPage, setNextPage] = useState(() => Math.floor((state.snapshot?.notes.length ?? 0) / 10) + 1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const refresh = useCallback(async () => {
    const refreshId = activeRefreshId.current + 1;
    activeRefreshId.current = refreshId;
    setState((current) => ({ ...current, isLoading: true, error: null }));

    try {
      const snapshot = await fetchPatchNotesSnapshot();
      if (activeRefreshId.current !== refreshId) {
        return;
      }
      setState({ snapshot, isLoading: false, error: null, usingCache: false });
      setNextPage(2);
      setHasMore(snapshot.notes.length > 0);
    } catch (error) {
      if (activeRefreshId.current !== refreshId) {
        return;
      }
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh Spectrum patch notes.',
        usingCache: Boolean(current.snapshot)
      }));
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextSnapshot = await fetchPatchNotesSnapshot(nextPage);
      if (nextSnapshot.notes.length === 0) {
        setHasMore(false);
        return;
      }

      setState((current) => {
        const mergedNotes = [...(current.snapshot?.notes ?? []), ...nextSnapshot.notes]
          .filter((note, index, notes) => notes.findIndex((candidate) => candidate.id === note.id) === index)
          .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
        const snapshot = {
          fetchedAt: current.snapshot?.fetchedAt ?? nextSnapshot.fetchedAt,
          notes: mergedNotes
        };
        saveCachedPatchNotes(snapshot);
        return { ...current, snapshot, error: null, usingCache: false };
      });
      setNextPage((page) => page + 1);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not load more Spectrum patch notes.'
      }));
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextPage]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), refreshIntervalMinutes * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [refresh, refreshIntervalMinutes]);

  return { ...state, refresh, loadMore, isLoadingMore, hasMore };
}
