import { articleDetail, extractArticleBlocks } from '../articles/blocks';
import type { ArticleContent } from '../articles/types';
import { loadCachedNews, saveCachedNews } from './cache';
import { loadCachedNewsDetail, saveCachedNewsDetail } from './detailsCache';
import { findNewsArticleSource, newsFallback, parseNewsListing } from './parser';
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

export async function fetchNewsDetails(url: string, summary = '', isVideo = false): Promise<ArticleContent> {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== 'https://robertsspaceindustries.com' || !/^\/(?:en\/)?comm-link\//.test(parsedUrl.pathname)) {
    throw new Error('Invalid RSI article URL.');
  }
  const cached = loadCachedNewsDetail(url);
  if (cached) return cached;
  const articlePath = parsedUrl.pathname.startsWith('/en/') ? parsedUrl.pathname : `/en${parsedUrl.pathname}`;
  let html = '';
  try {
    html = await fetchRsiPage(`https://robertsspaceindustries.com${articlePath}`, `/api/rsi-comm-link${articlePath}`);
    const sourceUrl = findNewsArticleSource(html);
    if (sourceUrl) {
      try {
        const source = new URL(sourceUrl);
        const contentHtml = await fetchRsiPage(sourceUrl, `/api/rsi-comm-link${source.pathname}${source.search}`);
        const blocks = extractArticleBlocks(contentHtml, sourceUrl);
        if (!blocks.length) throw new Error('No article content');
        const content = articleDetail(blocks, summary);
        saveCachedNewsDetail(url, content);
        return content;
      } catch { /* Retain the wrapper's content or summary if Alexandria fails. */ }
    }
    const blocks = extractArticleBlocks(html, url);
    if (!blocks.length) throw new Error('No article content');
    const content = articleDetail(blocks, summary);
    saveCachedNewsDetail(url, content);
    return content;
  } catch {
    // Do not persist fallbacks: a later open can retry a temporary failure.
    return newsFallback(html, summary, isVideo);
  }
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
