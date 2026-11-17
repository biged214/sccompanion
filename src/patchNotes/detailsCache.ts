import type { ArticleContent } from '../articles/types';
import { loadArticleDetail, saveArticleDetail } from '../articles/cache';

const CACHE_KEY = 'star-citizen-status:patch-note-details:v4';

export function loadCachedPatchNoteDetail(url: string): ArticleContent | null {
  return loadArticleDetail(CACHE_KEY, url);
}

export function saveCachedPatchNoteDetail(url: string, content: ArticleContent): void {
  saveArticleDetail(CACHE_KEY, url, content);
}
