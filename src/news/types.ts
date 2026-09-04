export type NewsCategory = 'News' | 'Weekly' | 'Roadmap' | 'Report' | 'Video' | 'Event' | 'Engineering';

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: string;
  category: NewsCategory;
  comments: number;
}

export interface NewsSnapshot {
  fetchedAt: string;
  articles: NewsArticle[];
}

export interface NewsState {
  snapshot: NewsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
