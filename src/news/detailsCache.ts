import type { ArticleContent } from '../articles/types';
interface CachedNewsDetail {
  content: ArticleContent;
  fetchedAt: string;
}

const CACHE_KEY = 'star-citizen-status:news-details:v6';
const MAX_CACHED_DETAILS = 20;

export function loadCachedNewsDetail(url: string): ArticleContent | null {
  try {
    return readCache()[url]?.content ?? null;
  } catch {
    return null;
  }
}

export function saveCachedNewsDetail(url: string, content: ArticleContent): void {
  try {
    const cache = readCache();
    cache[url] = { content, fetchedAt: new Date().toISOString() };
    const trimmed = Object.fromEntries(
      Object.entries(cache)
        .sort(([, left], [, right]) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))
        .slice(0, MAX_CACHED_DETAILS)
    );
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch { /* Storage is optional; never discard a successfully loaded article. */ }
}

function readCache(): Record<string, CachedNewsDetail> {
  const raw = window.localStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, CachedNewsDetail>;
  return parsed && typeof parsed === 'object' ? parsed : {};
}
