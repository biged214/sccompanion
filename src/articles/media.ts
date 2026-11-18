// Only normalized media URLs reach React. Remote HTML and scripts are never rendered.
import { videoEmbed } from './videoUrl';
import type { ArticleMedia } from './types';

export function safeMediaUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function extractArticleMedia(html: string, base = 'https://robertsspaceindustries.com'): ArticleMedia[] {
  const media = new Map<string, ArticleMedia>();
  const add = (raw: unknown, kind: ArticleMedia['kind'], alt = '') => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const url = safeMediaUrl(raw, base);
    if (!url) return;
    const embed = videoEmbed(url);
    if (kind === 'embed' && !embed) return;
    const key = embed || url;
    if (media.size < 40 && !media.has(key)) media.set(key, {kind: embed ? 'embed' : kind, url, ...(embed ? {embed} : {}), alt});
  };
  const scan = (markup: string, depth = 0) => {
    if (depth > 8) return;
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    // The structured Spectrum article is the original post, not its replies/navigation.
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const article = JSON.parse(script.textContent || 'null');
        if (article?.['@type'] === 'DiscussionForumPosting') {
          if (typeof article.articleBody === 'string') scan(article.articleBody, depth + 1);
          walk(article.image, 'image', depth + 1);
          walk(article.video, 'video', depth + 1);
          walk(article.associatedMedia, 'associatedMedia', depth + 1);
          return;
        }
      } catch { /* Ignore malformed metadata. */ }
    }
    for (const node of doc.querySelectorAll('[data-platform-client-props]')) {
      try {
        const props = JSON.parse(node.getAttribute('data-platform-client-props') || '{}');
        const inline = props.routerParams?.props?.content?.html;
        if (props.routerParams?.component === 'AlexandriaPage' && typeof inline === 'string') scan(inline, depth + 1);
      } catch { /* Legacy pages have no platform props. */ }
    }
    doc.querySelectorAll('nav, footer, header, script, component[is="script"], rsi-store-component, style, noscript, [hidden], [aria-hidden="true"], .g-author').forEach(node => node.remove());
    const root = doc.querySelector('#layout-system, .alexandria-content-body, article') || doc.body;
    for (const node of root.querySelectorAll('*')) {
      const alt = node.getAttribute('alt') || '';
      if (node.tagName === 'IMG') add(node.getAttribute('data-src') || node.getAttribute('src'), 'image', alt);
      if (node.tagName === 'VIDEO') add(node.getAttribute('src') || node.querySelector('source')?.getAttribute('src'), 'video', node.getAttribute('title') || '');
      if (node.tagName === 'IFRAME') add(node.getAttribute('src'), 'embed');
      if (node.tagName === 'A') add(node.getAttribute('href'), 'embed');
      const id = node.getAttribute('video-id');
      if (id && /^[\w-]{11}$/.test(id)) add(`https://www.youtube.com/watch?v=${id}`, 'embed');
      for (const name of ['body', 'content-body']) {
        const value = node.getAttribute(name);
        if (value) scan(value, depth + 1);
      }
      for (const name of node.getAttributeNames()) {
        if (![':info', ':properties', ':content', ':items', ':cards', ':sections', ':copy', ':picture', ':pictures', ':media'].includes(name)) continue;
        try { walk(JSON.parse(node.getAttribute(name) || 'null'), name.slice(1), depth + 1); } catch { /* Ignore malformed component data. */ }
      }
    }
  };
  const walk = (value: unknown, field: string, depth: number): void => {
    if (depth > 16 || !value) return;
    if (typeof value === 'string') {
      if (/<(?:img|video|iframe|a)\b/i.test(value)) scan(value, depth + 1);
      else if (['image', 'picture', 'pictures'].includes(field)) add(value, 'image');
      else if (['mp4', 'webm'].includes(field)) add(value, 'video');
      else if (/^(?:videoId|youtubeId)$/.test(field) && /^[\w-]{11}$/.test(value)) add(`https://www.youtube.com/watch?v=${value}`, 'embed');
      else if (['url', 'embedUrl', 'video'].includes(field)) add(value, 'embed');
      return;
    }
    if (Array.isArray(value)) { value.forEach(item => walk(item, field, depth + 1)); return; }
    if (typeof value !== 'object') return;
    const record = value as Record<string, any>;
    if (record.displayed === false || record.isDisplayed === false || record.dispositions?.large?.display === false) return;
    // RSI provides the same picture in several sizes/formats; choose one.
    if (record.originalFormat || record.webp) {
      const formats = record.originalFormat || record.webp;
      add(formats.desktop || formats.max || formats.mobile, 'image', typeof record.alt === 'string' ? record.alt : '');
      return;
    }
    if (record['@type'] === 'ImageObject') { add(record.contentUrl || record.url, 'image', record.caption || ''); return; }
    if (record['@type'] === 'VideoObject') { add(record.embedUrl, 'embed'); add(record.contentUrl, 'video'); return; }
    for (const [key, entry] of Object.entries(record)) {
      if (['logo', 'placeholder', 'thumbnail', 'mask', 'overlay', 'sku', 'skus', 'skuList', 'backgroundOptions', 'background-options'].includes(key)) continue;
      walk(entry, key, depth + 1);
    }
  };
  scan(html);
  return [...media.values()];
}
