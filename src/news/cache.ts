import type { NewsSnapshot } from './types';

const CACHE_KEY = 'star-citizen-status:news-snapshot';

export function loadCachedNews(): NewsSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewsSnapshot;
    return Array.isArray(parsed.articles) && parsed.fetchedAt ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedNews(snapshot: NewsSnapshot): void {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}
