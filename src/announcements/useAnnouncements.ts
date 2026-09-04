import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAnnouncementsSnapshot,
  getCachedAnnouncementsSnapshot,
  saveCachedAnnouncements
} from './announcementService';
import type { AnnouncementsState } from './types';

export function useAnnouncements(refreshIntervalMinutes = 10): AnnouncementsState & {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  isLoadingMore: boolean;
  hasMore: boolean;
} {
  const [state, setState] = useState<AnnouncementsState>(() => {
    const cached = getCachedAnnouncementsSnapshot();
    return { snapshot: cached, isLoading: !cached, error: null, usingCache: Boolean(cached) };
  });
  const activeRefreshId = useRef(0);
  const [nextPage, setNextPage] = useState(2);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const refresh = useCallback(async () => {
    const refreshId = ++activeRefreshId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await fetchAnnouncementsSnapshot();
      if (activeRefreshId.current !== refreshId) return;
      setState({ snapshot, isLoading: false, error: null, usingCache: false });
      setNextPage(2);
      setHasMore(snapshot.announcements.length > 0);
    } catch (error) {
      if (activeRefreshId.current !== refreshId) return;
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh Spectrum announcements.',
        usingCache: Boolean(current.snapshot)
      }));
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextSnapshot = await fetchAnnouncementsSnapshot(nextPage);
      if (nextSnapshot.announcements.length === 0) {
        setHasMore(false);
        return;
      }
      setState((current) => {
        const announcements = [...(current.snapshot?.announcements ?? []), ...nextSnapshot.announcements]
          .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
          .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
        const snapshot = { fetchedAt: current.snapshot?.fetchedAt ?? nextSnapshot.fetchedAt, announcements };
        saveCachedAnnouncements(snapshot);
        return { ...current, snapshot, error: null, usingCache: false };
      });
      setNextPage((page) => page + 1);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not load more Spectrum announcements.'
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
