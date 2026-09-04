import { parseAnnouncementArticle, parseAnnouncementsForum } from './parser';
import type { AnnouncementsSnapshot } from './types';

export const RSI_ANNOUNCEMENTS_URL =
  'https://robertsspaceindustries.com/spectrum/community/SC/forum/1';

const SNAPSHOT_CACHE_KEY = 'sc-companion:announcements-snapshot:v1';
const DETAILS_CACHE_KEY = 'sc-companion:announcement-details:v1';
const MAX_CACHED_DETAILS = 30;

interface CachedDetail {
  content: string;
  fetchedAt: string;
}

export async function fetchAnnouncementsSnapshot(page = 1): Promise<AnnouncementsSnapshot> {
  const url = page === 1 ? RSI_ANNOUNCEMENTS_URL : `${RSI_ANNOUNCEMENTS_URL}?page=${page}`;
  const html = await fetchSpectrumPage(url);
  const snapshot = parseAnnouncementsForum(html);
  if (page === 1) saveCachedAnnouncements(snapshot);
  return snapshot;
}

export async function fetchAnnouncementDetails(url: string): Promise<string> {
  const cached = readDetailsCache()[url]?.content;
  if (cached) return cached;

  const content = parseAnnouncementArticle(await fetchSpectrumPage(url));
  const cache = readDetailsCache();
  cache[url] = { content, fetchedAt: new Date().toISOString() };
  const trimmed = Object.fromEntries(
    Object.entries(cache)
      .sort(([, left], [, right]) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))
      .slice(0, MAX_CACHED_DETAILS)
  );
  window.localStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(trimmed));
  return content;
}

export function getCachedAnnouncementsSnapshot(): AnnouncementsSnapshot | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SNAPSHOT_CACHE_KEY) ?? 'null') as AnnouncementsSnapshot | null;
    return parsed?.fetchedAt && Array.isArray(parsed.announcements) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedAnnouncements(snapshot: AnnouncementsSnapshot): void {
  window.localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
}

async function fetchSpectrumPage(url: string): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`Spectrum returned ${response.status}.`);
    return response.text();
  }

  const spectrumUrl = new URL(url);
  const response = await window.fetch(`/api/rsi-spectrum${spectrumUrl.pathname}${spectrumUrl.search}`);
  if (!response.ok) throw new Error(`Spectrum returned ${response.status}.`);
  return response.text();
}

function readDetailsCache(): Record<string, CachedDetail> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DETAILS_CACHE_KEY) ?? '{}') as Record<string, CachedDetail>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
