import { loadArticleDetail, saveArticleDetail, saveFeedSnapshot } from '../articles/cache';
import { spectrumArticleDetail } from '../articles/blocks';
import type { ArticleContent } from '../articles/types';
import { parseAnnouncementArticle, parseAnnouncementsForum } from './parser';
import type { AnnouncementsSnapshot } from './types';

export const RSI_ANNOUNCEMENTS_URL =
  'https://robertsspaceindustries.com/spectrum/community/SC/forum/1';

const SNAPSHOT_CACHE_KEY = 'sc-companion:announcements-snapshot:v1';
const DETAILS_CACHE_KEY = 'sc-companion:announcement-details:v3';
export async function fetchAnnouncementsSnapshot(page = 1): Promise<AnnouncementsSnapshot> {
  const url = page === 1 ? RSI_ANNOUNCEMENTS_URL : `${RSI_ANNOUNCEMENTS_URL}?page=${page}`;
  const html = await fetchSpectrumPage(url);
  const snapshot = parseAnnouncementsForum(html);
  if (page === 1) saveCachedAnnouncements(snapshot);
  return snapshot;
}

export async function fetchAnnouncementDetails(url: string): Promise<ArticleContent> {
  const cached = loadArticleDetail(DETAILS_CACHE_KEY, url);
  if (cached) return cached;

  const html = await fetchSpectrumPage(url);
  const content = spectrumArticleDetail(html, parseAnnouncementArticle(html), url);
  saveArticleDetail(DETAILS_CACHE_KEY, url, content);
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
  saveFeedSnapshot(SNAPSHOT_CACHE_KEY, snapshot);
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
