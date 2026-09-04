import { useCallback, useEffect, useRef, useState } from 'react';
import { saveCachedNews } from './cache';
import { fetchNewsSnapshot, getCachedNewsSnapshot } from './newsService';
import type { NewsState } from './types';

export function useNews(refreshIntervalMinutes = 10): NewsState & {
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  isLoadingMore: boolean;
  hasMore: boolean;
} {
  const [state, setState] = useState<NewsState>(() => {
    const cached = getCachedNewsSnapshot();
    return { snapshot: cached, isLoading: !cached, error: null, usingCache: Boolean(cached) };
  });
  const activeRefreshId = useRef(0);
  const [nextPage, setNextPage] = useState(() => Math.floor((state.snapshot?.articles.length ?? 0) / 10) + 1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const refresh = useCallback(async () => {
    const refreshId = ++activeRefreshId.current;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await fetchNewsSnapshot();
      if (activeRefreshId.current !== refreshId) return;
      setState({ snapshot, isLoading: false, error: null, usingCache: false });
      setNextPage(2);
      setHasMore(snapshot.articles.length > 0);
    } catch (error) {
      if (activeRefreshId.current !== refreshId) return;
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not refresh RSI news.',
        usingCache: Boolean(current.snapshot)
      }));
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextSnapshot = await fetchNewsSnapshot(nextPage);
      let addedCount = 0;
      setState((current) => {
        const existing = current.snapshot?.articles ?? [];
        const merged = [...existing, ...nextSnapshot.articles]
          .filter((article, index, articles) => articles.findIndex((candidate) => candidate.id === article.id) === index)
          .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
        addedCount = merged.length - existing.length;
        const snapshot = { fetchedAt: current.snapshot?.fetchedAt ?? nextSnapshot.fetchedAt, articles: merged };
        saveCachedNews(snapshot);
        return { ...current, snapshot, error: null, usingCache: false };
      });
      setHasMore(addedCount > 0 && nextSnapshot.articles.length >= 10);
      setNextPage((page) => page + 1);
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Could not load more RSI news.'
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
