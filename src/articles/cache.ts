import { articleDetail } from './blocks';
import type { ArticleContent, ArticleDetail } from './types';

const MAX_CACHE_BYTES = 512 * 1024;
const MAX_ENTRIES = 20;
const CURRENT_DETAIL_VERSIONS: Record<string, number> = {
  'star-citizen-status:news-details': 6,
  'star-citizen-status:patch-note-details': 4,
  'sc-companion:announcement-details': 3
};
type StoredContent = ArticleContent | Pick<ArticleDetail, 'blocks' | 'unpositionedMedia'>;
interface Entry { content: StoredContent; fetchedAt: string }

// Remove only obsolete, re-downloadable article caches; never user settings/history.
function removeObsoleteDetails(storage: Storage): void {
  const obsolete: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    const match = key?.match(/^(.*):v(\d+)$/);
    if (key && match && CURRENT_DETAIL_VERSIONS[match[1]] && Number(match[2]) < CURRENT_DETAIL_VERSIONS[match[1]]) obsolete.push(key);
  }
  obsolete.forEach(key => storage.removeItem(key));
}

function read(storage: Storage, key: string): Record<string, Entry> {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function loadArticleDetail(key: string, url: string): ArticleContent | null {
  try {
    const storage = window.localStorage;
    removeObsoleteDetails(storage);
    const content = read(storage, key)[url]?.content;
    if (typeof content === 'string') return content || null;
    if (!content || typeof content !== 'object') return null;
    if (Array.isArray(content.blocks) && content.blocks.length) {
      return {...articleDetail(content.blocks), unpositionedMedia: content.unpositionedMedia};
    }
    return 'text' in content && typeof content.text === 'string' && Array.isArray(content.media) ? content : null;
  } catch { return null; }
}

export function saveArticleDetail(key: string, url: string, content: ArticleContent): void {
  try {
    const storage = window.localStorage;
    removeObsoleteDetails(storage);
    // Text/media are derived from blocks. Persist one copy instead of duplicating them.
    const compact = typeof content !== 'string' && content.blocks?.length
      ? {blocks: content.blocks, ...(content.unpositionedMedia?.length ? {unpositionedMedia: content.unpositionedMedia} : {})}
      : content;
    const entry: Entry = {content: compact, fetchedAt: new Date().toISOString()};
    if (JSON.stringify({[url]: entry}).length * 2 > MAX_CACHE_BYTES) return;
    const older = Object.entries(read(storage, key))
      .filter(([entryUrl, item]) => entryUrl !== url && item && typeof item.fetchedAt === 'string')
      .sort(([, left], [, right]) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt));
    const entries: [string, Entry][] = [[url, entry] as [string, Entry], ...older].slice(0, MAX_ENTRIES);
    while (entries.length) {
      const serialized = JSON.stringify(Object.fromEntries(entries));
      if (serialized.length * 2 <= MAX_CACHE_BYTES) {
        try { storage.setItem(key, serialized); return; }
        catch { /* Other app caches may consume quota. Retry with fewer articles. */ }
      }
      entries.pop();
    }
    // The current cache cannot fit even one entry. Free only this disposable cache.
    storage.removeItem(key);
  } catch { /* Cache failures must never turn a loaded article into an error. */ }
}

export function saveFeedSnapshot(key: string, snapshot: unknown): void {
  try {
    const storage = window.localStorage;
    removeObsoleteDetails(storage);
    const serialized = JSON.stringify(snapshot);
    if (serialized.length * 2 <= MAX_CACHE_BYTES) storage.setItem(key, serialized);
  } catch { /* Live feeds remain usable when storage is full or disabled. */ }
}
