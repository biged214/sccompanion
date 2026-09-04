interface CachedNewsDetail {
  content: string;
  fetchedAt: string;
}

const CACHE_KEY = 'star-citizen-status:news-details:v2';
const MAX_CACHED_DETAILS = 20;

export function loadCachedNewsDetail(url: string): string | null {
  try {
    return readCache()[url]?.content ?? null;
  } catch {
    return null;
  }
}

export function saveCachedNewsDetail(url: string, content: string): void {
  const cache = readCache();
  cache[url] = { content, fetchedAt: new Date().toISOString() };
  const trimmed = Object.fromEntries(
    Object.entries(cache)
      .sort(([, left], [, right]) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))
      .slice(0, MAX_CACHED_DETAILS)
  );
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
}

function readCache(): Record<string, CachedNewsDetail> {
  const raw = window.localStorage.getItem(CACHE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, CachedNewsDetail>;
  return parsed && typeof parsed === 'object' ? parsed : {};
}
