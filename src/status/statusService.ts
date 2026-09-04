import { loadCachedStatus, saveCachedStatus } from './cache';
import { parseCurrentStatusPage, parseStatusFeed } from './rss';
import type { StatusSnapshot } from './types';

export const RSI_STATUS_FEED_URL = 'https://status.robertsspaceindustries.com/index.xml';
export const RSI_STATUS_PAGE_URL = 'https://status.robertsspaceindustries.com/';
const BROWSER_STATUS_FEED_URL = '/api/rsi-status';
const BROWSER_STATUS_PAGE_URL = '/api/rsi-status-page';

export async function fetchStatusSnapshot(): Promise<StatusSnapshot> {
  const [xmlText, statusPageHtml] = await Promise.all([
    fetchText(RSI_STATUS_FEED_URL, BROWSER_STATUS_FEED_URL),
    fetchText(RSI_STATUS_PAGE_URL, BROWSER_STATUS_PAGE_URL)
  ]);
  const snapshot = parseStatusFeed(xmlText);
  snapshot.currentStatus = parseCurrentStatusPage(statusPageHtml);
  saveCachedStatus(snapshot);
  return snapshot;
}

export function getCachedStatusSnapshot(): StatusSnapshot | null {
  return loadCachedStatus();
}

async function fetchText(url: string, browserUrl: string): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`RSI status service returned ${response.status}.`);
    }

    return response.text();
  }

  // Browsers enforce CORS for RSI status resources, so Vite proxies web previews.
  const response = await window.fetch(browserUrl);
  if (!response.ok) {
    throw new Error(`RSI status service returned ${response.status}.`);
  }

  return response.text();
}
