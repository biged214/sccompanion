export interface ArticleMedia {
  kind: 'image' | 'video' | 'embed';
  url: string;
  embed?: string;
  alt: string;
}

export type ArticleBlock = { kind: 'text'; text: string } | { kind: 'media'; media: ArticleMedia };

export interface ArticleDetail {
  blocks?: ArticleBlock[];
  unpositionedMedia?: ArticleMedia[];
  text: string;
  media: ArticleMedia[];
}

export type ArticleContent = string | ArticleDetail;
