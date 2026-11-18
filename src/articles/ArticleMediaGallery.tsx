import { useState } from 'react';
import { t } from '../i18n';
import { openExternalUrl } from '../platform/openExternalUrl';
import { safeMediaUrl } from './media';
import { videoEmbed } from './videoUrl';
import type { ArticleMedia } from './types';

export function ArticleMediaGallery({ media }: { media: ArticleMedia[] }) {
  return <div className="article-media">{media.map((item) => <MediaItem key={`${item.kind}:${item.url}`} item={item} />)}</div>;
}

function MediaItem({ item }: { item: ArticleMedia }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Revalidate persisted data before using it as a browser resource.
  const url = safeMediaUrl(item.url, 'https://robertsspaceindustries.com');
  if (!url || (failed && item.kind === 'image')) return null;
  const embed = item.kind === 'embed' ? videoEmbed(url) : null;
  return <figure className="article-media__item">
    {!failed && item.kind === 'image' && <img src={url} alt={item.alt || t('Article image')} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    {!failed && item.kind === 'video' && <video src={url} controls preload="none" onError={() => setFailed(true)} />}
    {!failed && embed && (playing
      ? <iframe title={item.alt || t('Article video')} src={embed} referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" onError={() => setFailed(true)} />
      : <button type="button" className="refresh-button" onClick={() => setPlaying(true)}>{t('Play video')}</button>)}
    {failed && <p>{t('This media could not be loaded. Open the original media to view it.')}</p>}
    {item.kind !== 'image' && <figcaption><a className="details-link" href={url} target="_blank" rel="noreferrer" onClick={(event) => {
      if (window.__TAURI_INTERNALS__) { event.preventDefault(); void openExternalUrl(url).catch(() => setFailed(true)); }
    }}>{t('Open original video')}</a></figcaption>}
  </figure>;
}
