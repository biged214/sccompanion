import type { ArticleContent } from '../articles/types';
import { loadArticleDetail, saveArticleDetail } from '../articles/cache';

const CACHE_KEY = 'star-citizen-status:news-details:v8';

export function loadCachedNewsDetail(url: string): ArticleContent | null {
  return loadArticleDetail(CACHE_KEY, url);
}

export function saveCachedNewsDetail(url: string, content: ArticleContent): void {
  saveArticleDetail(CACHE_KEY, url, content);
}
