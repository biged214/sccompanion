import { loadCachedNews, saveCachedNews } from './cache';
import { loadCachedNewsDetail, saveCachedNewsDetail } from './detailsCache';
import { findNewsArticleSource, parseNewsArticle, parseNewsListing } from './parser';
import type { NewsSnapshot } from './types';

export const RSI_NEWS_URL = 'https://robertsspaceindustries.com/en/comm-link/rss';
const BROWSER_NEWS_URL = '/api/rsi-news';

export async function fetchNewsSnapshot(page = 1): Promise<NewsSnapshot> {
  const url = page === 1 ? RSI_NEWS_URL : `${RSI_NEWS_URL}?page=${page}`;
  const html = await fetchRsiPage(url, page === 1 ? BROWSER_NEWS_URL : `${BROWSER_NEWS_URL}?page=${page}`);
  const snapshot = parseNewsListing(html);
  if (page === 1) saveCachedNews(snapshot);
  return snapshot;
}

export function getCachedNewsSnapshot(): NewsSnapshot | null {
  return loadCachedNews();
}

export async function fetchNewsDetails(url: string): Promise<string> {
  const cached = loadCachedNewsDetail(url);
  if (cached) return cached;
  const parsedUrl = new URL(url);
  const articlePath = parsedUrl.pathname.startsWith('/en/') ? parsedUrl.pathname : `/en${parsedUrl.pathname}`;
  const html = await fetchRsiPage(url, `/api/rsi-comm-link${articlePath}`);
  const sourceUrl = findNewsArticleSource(html);
  const contentHtml = sourceUrl
    ? await fetchRsiPage(sourceUrl, `/api/rsi-comm-link${new URL(sourceUrl).pathname}`)
    : html;
  const content = parseNewsArticle(contentHtml);
  saveCachedNewsDetail(url, content);
  return content;
}

async function fetchRsiPage(url: string, browserUrl: string): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`RSI Comm-Link returned ${response.status}.`);
    return response.text();
  }

  const response = await window.fetch(browserUrl);
  if (!response.ok) throw new Error(`RSI Comm-Link returned ${response.status}.`);
  return response.text();
}
