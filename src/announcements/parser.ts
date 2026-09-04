import { normalizePatchNoteBody } from '../patchNotes/parser';
import type { Announcement, AnnouncementsSnapshot } from './types';

interface JsonLdInteraction {
  interactionType?: string;
  userInteractionCount?: number;
}

interface JsonLdListItem {
  item?: {
    name?: string;
    url?: string;
    datePublished?: string;
    author?: { name?: string };
    interactionStatistic?: JsonLdInteraction[];
  };
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

export function parseAnnouncementsForum(
  html: string,
  fetchedAt = new Date().toISOString()
): AnnouncementsSnapshot {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const itemList = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((script) => parseJson<JsonLdCollection>(script.textContent ?? ''))
    .find((value) => value?.['@type'] === 'CollectionPage' && value.mainEntity?.['@type'] === 'ItemList')
    ?.mainEntity?.itemListElement;

  if (!itemList) {
    throw new Error('The Spectrum announcements page did not include a structured thread list.');
  }

  const announcements = itemList
    .map(parseAnnouncement)
    .filter((announcement): announcement is Announcement => announcement !== null)
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  return { fetchedAt, announcements };
}

export function parseAnnouncementArticle(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((script) => parseJson<JsonLdArticle>(script.textContent ?? ''))
    .find((value) => value?.['@type'] === 'DiscussionForumPosting' && value.articleBody);

  if (!article?.articleBody) {
    throw new Error('Spectrum did not include the full announcement.');
  }

  return normalizePatchNoteBody(article.articleBody);
}

function parseAnnouncement(entry: JsonLdListItem): Announcement | null {
  const item = entry.item;
  if (!item?.name || !item.url || !item.datePublished) return null;

  return {
    id: item.url,
    title: item.name,
    url: item.url,
    publishedAt: new Date(item.datePublished).toISOString(),
    author: item.author?.name ?? 'CIG',
    replies: readInteraction(item.interactionStatistic, 'ReplyAction'),
    views: readInteraction(item.interactionStatistic, 'ViewAction'),
    votes: readInteraction(item.interactionStatistic, 'LikeAction')
  };
}

function readInteraction(statistics: JsonLdInteraction[] | undefined, action: string): number {
  if (!Array.isArray(statistics)) return 0;
  return statistics.find((entry) => entry.interactionType?.endsWith(action))?.userInteractionCount ?? 0;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
