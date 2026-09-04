import type { PatchChannel, PatchNote, PatchNotesSnapshot } from './types';

interface JsonLdListItem {
  item?: {
    name?: string;
    url?: string;
    datePublished?: string;
    author?: { name?: string };
    interactionStatistic?: JsonLdInteraction[];
  };
}

interface JsonLdInteraction {
  interactionType?: string;
  userInteractionCount?: number;
}

interface JsonLdCollection {
  '@type'?: string;
  mainEntity?: {
    '@type'?: string;
    itemListElement?: JsonLdListItem[];
  };
}

interface JsonLdArticle {
  '@type'?: string;
  articleBody?: string;
}

export function parsePatchNotesForum(
  html: string,
  fetchedAt = new Date().toISOString()
): PatchNotesSnapshot {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const collections = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((script) => parseJsonLd(script.textContent ?? ''))
    .filter((value): value is JsonLdCollection => value !== null);
  const itemList = collections.find(
    (value) => value['@type'] === 'CollectionPage' && value.mainEntity?.['@type'] === 'ItemList'
  )?.mainEntity?.itemListElement;

  if (!itemList) {
    throw new Error('The Spectrum patch-notes page did not include a structured thread list.');
  }

  const notes = itemList
    .map((entry) => parsePatchNote(entry))
    .filter((note): note is PatchNote => note !== null)
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  return { fetchedAt, notes };
}

export function parsePatchNoteArticle(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((script) => parseJsonLdArticle(script.textContent ?? ''))
    .find((value) => value?.['@type'] === 'DiscussionForumPosting' && value.articleBody);

  if (!article?.articleBody) {
    throw new Error('Spectrum did not include the full patch-note article.');
  }

  return normalizePatchNoteBody(article.articleBody);
}

export function normalizePatchNoteBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    // Spectrum's JSON-LD uses five spaces for most block-level boundaries.
    .replace(/[ \t]{5,}/g, '\n')
    .replace(/!\s+(?=Patch should now show:)/gi, '!\n\n')
    .replace(/\s+(?=Testing\/Feedback Focus\b)/gi, '\n')
    .replace(/[ \t]{2,}(?=Known Issues\b)/gi, '\n')
    .replace(/[ \t]{2,}(?=Bug Fixes(?: & Technical(?: Updates)?)?\b)/gi, '\n')
    .replace(/(Bug Fixes(?: & Technical(?: Updates)?)?)\s+-\s+/gi, '$1\n')
    .replace(/\s+(?=(?:Potential Fix|Partial Fix|Workaround):)/gi, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n')
    .trim();
}

function parseJsonLd(value: string): JsonLdCollection | null {
  try {
    return JSON.parse(value) as JsonLdCollection;
  } catch {
    return null;
  }
}

function parseJsonLdArticle(value: string): JsonLdArticle | null {
  try {
    return JSON.parse(value) as JsonLdArticle;
  } catch {
    return null;
  }
}

function parsePatchNote(entry: JsonLdListItem): PatchNote | null {
  const item = entry.item;
  if (!item?.name || !item.url || !item.datePublished) {
    return null;
  }

  return {
    id: item.url,
    title: item.name,
    url: item.url,
    publishedAt: new Date(item.datePublished).toISOString(),
    author: item.author?.name ?? 'CIG',
    replies: readInteraction(item.interactionStatistic, 'ReplyAction'),
    views: readInteraction(item.interactionStatistic, 'ViewAction'),
    votes: readInteraction(item.interactionStatistic, 'LikeAction'),
    channel: inferPatchChannel(item.name)
  };
}

function readInteraction(
  statistics: JsonLdInteraction[] | undefined,
  action: string
): number {
  if (!Array.isArray(statistics)) {
    return 0;
  }

  return statistics.find((entry) => entry.interactionType?.endsWith(action))?.userInteractionCount ?? 0;
}

function inferPatchChannel(title: string): PatchChannel {
  const normalized = title.toLowerCase();
  if (normalized.includes('hotfix')) {
    return 'Hotfix';
  }
  if (normalized.includes('ptu')) {
    return 'PTU';
  }
  if (normalized.includes('live')) {
    return 'LIVE';
  }
  return 'Release';
}
