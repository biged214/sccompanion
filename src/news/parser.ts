import { articleDetail, extractArticleBlocks } from '../articles/blocks';
import type { NewsArticle, NewsCategory, NewsSnapshot } from './types';

const RSI_ORIGIN = 'https://robertsspaceindustries.com';

export function parseNewsListing(
  html: string,
  fetchedAt = new Date().toISOString()
): NewsSnapshot {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const articles = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a.content-block2.hub-block'))
    .map((entry) => parseNewsEntry(entry, fetchedAt))
    .filter((article): article is NewsArticle => article !== null);

  if (articles.length === 0) {
    throw new Error('The RSI Comm-Link page did not include any news articles.');
  }

  return { fetchedAt, articles };
}

export function parseNewsArticle(html: string): string {
  const content = articleDetail(extractArticleBlocks(html));
  if (!content.text) throw new Error('The RSI Comm-Link article did not include readable text.');
  return content.text;
}

export function findNewsArticleSource(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const candidate = platformContent(doc)?.htmlUrl ?? html.match(/(?:const|let|var)\s+s3Url\s*=\s*['"]([^'"]+)/i)?.[1];
  if (typeof candidate !== 'string') return null;
  try {
    const url = new URL(candidate, RSI_ORIGIN);
    return url.origin === RSI_ORIGIN && !url.username && !url.password && url.pathname.startsWith('/alexandria/') ? url.href : null;
  } catch { return null; }
}

function parseNewsEntry(entry: HTMLAnchorElement, fetchedAt: string): NewsArticle | null {
  const href = entry.getAttribute('href');
  const title = normalizeText(entry.querySelector('.title')?.textContent ?? '');
  if (!href || !title || !href.toLowerCase().includes('/comm-link/')) {
    return null;
  }

  const type = normalizeText(entry.querySelector('.type span')?.textContent ?? 'post');
  const url = new URL(href, RSI_ORIGIN).href;

  return {
    id: url,
    title,
    url,
    publishedAt: parseRelativeDate(
      normalizeText(entry.querySelector('.time_ago .value')?.textContent ?? ''),
      fetchedAt
    ),
    summary: normalizeText(entry.querySelector('.over .body')?.textContent ?? '') || 'Official RSI Comm-Link update.',
    category: inferCategory(title, type, url),
    comments: Number.parseInt(entry.querySelector('.comments')?.textContent ?? '0', 10) || 0
  };
}

function parseRelativeDate(value: string, fetchedAt: string): string {
  const date = new Date(fetchedAt);
  if (!value || /^(?:just now|moments ago)$/i.test(value)) {
    return date.toISOString();
  }
  if (/^yesterday$/i.test(value)) {
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString();
  }

  const match = value.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/i);
  if (!match) {
    return date.toISOString();
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'minute') date.setUTCMinutes(date.getUTCMinutes() - amount);
  if (unit === 'hour') date.setUTCHours(date.getUTCHours() - amount);
  if (unit === 'day') date.setUTCDate(date.getUTCDate() - amount);
  if (unit === 'week') date.setUTCDate(date.getUTCDate() - amount * 7);
  if (unit === 'month') date.setUTCMonth(date.getUTCMonth() - amount);
  if (unit === 'year') date.setUTCFullYear(date.getUTCFullYear() - amount);
  return date.toISOString();
}

function inferCategory(title: string, type: string, url: string): NewsCategory {
  const normalized = title.toLowerCase();
  if (type.toLowerCase() === 'video') return 'Video';
  if (normalized.includes('this week in star citizen')) return 'Weekly';
  if (normalized.includes('roadmap roundup')) return 'Roadmap';
  if (normalized.includes('monthly report')) return 'Report';
  if (/event|citizencon|bar citizen|free fly|festival|ship showdown/i.test(title)) return 'Event';
  if (url.toLowerCase().includes('/engineering/')) return 'Engineering';
  return 'News';
}

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

// RSI now ships an empty SPA shell; the article is in Alexandria content,
// referenced by JSON on the platform client script. Never execute that script.
function platformContent(doc: Document): { html?: unknown; htmlUrl?: unknown } | undefined {
  for (const element of doc.querySelectorAll('[data-platform-client-props]')) {
    try {
      const props = JSON.parse(element.getAttribute('data-platform-client-props') ?? '');
      if (props.routerParams?.component === 'AlexandriaPage') return props.routerParams.props?.content;
    } catch { /* A malformed component must not prevent legacy extraction. */ }
  }
}

export function newsFallback(html: string, summary = '', isVideo = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const metadata = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
  const description = summary || (/Roberts Space Industries is the official go-to/i.test(metadata) ? '' : metadata);
  const clean = new DOMParser().parseFromString(description, 'text/html');
  clean.querySelectorAll('script, style').forEach((element) => element.remove());
  const text = normalizeText(clean.body.textContent ?? '');
  const hasVideo = isVideo || Boolean(doc.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]'));
  return [text, hasVideo
    ? 'This post includes video. Open the original RSI article to watch it and read any additional content.'
    : 'Full article text is currently unavailable here. Open the original RSI article for the complete update.'].filter(Boolean).join('\n\n');
}
