import { useState } from 'react';
import type { ArticleBlock } from './types';
import { ArticleMediaGallery } from './ArticleMediaGallery';
import { safeMediaUrl } from './media';
import { openExternalUrl } from '../platform/openExternalUrl';

export function ArticlePromotion({ promotion }: { promotion: Extract<ArticleBlock, {kind: 'promotion'}> }) {
  const [failed, setFailed] = useState(false);
  const url = safeMediaUrl(promotion.url, 'https://robertsspaceindustries.com');
  return <section className="article-promotion">
    {promotion.text.split(/\n+/).filter(Boolean).map((text, index) => text.startsWith('## ')
      ? <h4 key={index}>{text.slice(3)}</h4> : <p key={index}>{text}</p>)}
    <ArticleMediaGallery media={promotion.media} />
    {url && <a className="details-link" href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
      if (window.__TAURI_INTERNALS__) {
        event.preventDefault();
        void openExternalUrl(url).catch(() => setFailed(true));
      }
    }}>{promotion.label}</a>}
    {failed && <p role="alert">{url}</p>}
  </section>;
}
