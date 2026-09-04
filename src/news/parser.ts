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
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('#layout-system') ?? doc.querySelector('.alexandria-content-body') ?? doc.body;
  if (!root) {
    throw new Error('The RSI Comm-Link article did not include a readable article body.');
  }

  const embeddedRoots = Array.from(root.querySelectorAll<HTMLElement>('[body], [content-body]'))
    .flatMap((element) => ['body', 'content-body'].map((name) => element.getAttribute(name)))
    .filter((value): value is string => Boolean(value && /<(?:h[1-6]|p|li|blockquote)\b/i.test(value)))
    .map((value) => new DOMParser().parseFromString(value, 'text/html').body);
  const textBlocks = [root, ...embeddedRoots].flatMap((contentRoot) =>
    Array.from(contentRoot.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, blockquote'))
  );
  const elementLines = textBlocks
    .filter((element) => !element.closest('.g-author, nav, footer'))
    .filter((element) => !element.parentElement?.closest('li, blockquote'))
    .map(elementToLine);
  const structuredLines = extractStructuredContent(root);
  const lines = [...elementLines, ...structuredLines]
    .filter((line) => Boolean(line))
    .filter((line, index, values) => line !== values[index - 1]);

  if (lines.length === 0) {
    throw new Error('The RSI Comm-Link article did not include readable text.');
  }

  return lines.join('\n\n');
}

const STRUCTURED_ATTRIBUTES = new Set([':content', ':question-list', ':items', ':cards', ':sections', ':copy']);
const STRUCTURED_TEXT_FIELDS = new Set(['overline', 'title', 'subtitle', 'heading', 'paragraph', 'body', 'content', 'description', 'text']);
const STRUCTURED_SKIP_FIELDS = new Set([
  'media',
  'background',
  'background-options',
  'semanticTag',
  'logo',
  'overlay',
  'callToAction',
  '__typename'
]);

function extractStructuredContent(root: Element): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*')).flatMap((element) =>
    element.getAttributeNames()
      .filter((name) => STRUCTURED_ATTRIBUTES.has(name))
      .flatMap((name) => {
        const value = element.getAttribute(name);
        if (!value) return [];
        try {
          return collectStructuredLines(JSON.parse(value));
        } catch {
          return [];
        }
      })
  );
}

function collectStructuredLines(value: unknown, field = ''): string[] {
  if (typeof value === 'string') {
    if (!STRUCTURED_TEXT_FIELDS.has(field)) return [];
    return parseStructuredText(value, field);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStructuredLines(entry));
  }
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  if (record.displayed === false) return [];
  return Object.entries(record).flatMap(([key, entry]) =>
    STRUCTURED_SKIP_FIELDS.has(key) ? [] : collectStructuredLines(entry, key)
  );
}

function parseStructuredText(value: string, field: string): string[] {
  const fragment = new DOMParser().parseFromString(value, 'text/html');
  const blocks = Array.from(fragment.body.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, blockquote'));
  if (blocks.length > 0) {
    return blocks
      .filter((element) => !element.parentElement?.closest('li, blockquote'))
      .map(elementToLine)
      .filter(Boolean);
  }

  const text = normalizeText(fragment.body.textContent ?? value);
  if (!text) return [];
  return ['overline', 'title', 'subtitle', 'heading'].includes(field) ? [`## ${text}`] : [text];
}

function elementToLine(element: HTMLElement): string {
  const text = readableElementText(element);
  if (!text) return '';
  if (/^H[1-6]$/.test(element.tagName)) return `## ${text}`;
  if (element.tagName === 'LI') return `• ${text}`;
  return text;
}

function readableElementText(element: HTMLElement): string {
  const pieces: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pieces.push(node.textContent ?? '');
      return;
    }
    node.childNodes.forEach(visit);
    pieces.push(' ');
  };
  element.childNodes.forEach(visit);
  return normalizeText(pieces.join(' ')).replace(/\s+([,.;:!?])/g, '$1');
}

export function findNewsArticleSource(html: string): string | null {
  return html.match(/const\s+s3Url\s*=\s*['"]([^'"]+)/i)?.[1] ?? null;
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
