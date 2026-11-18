import { extractArticleMedia, safeMediaUrl } from './media';
import type { ArticleBlock, ArticleDetail, ArticleMedia } from './types';

const TEXT_FIELDS = new Set(['overline', 'title', 'subtitle', 'heading', 'paragraph', 'introduction', 'body', 'content', 'contents', 'description', 'text']);
const HEADINGS = new Set(['overline', 'title', 'subtitle', 'heading']);
const ATTRIBUTES = new Set([':info', ':properties', ':content', ':question-list', ':items', ':cards', ':sections', ':copy', ':picture', ':pictures', ':media']);
const SKIP = new Set(['logo', 'placeholder', 'thumbnail', 'mask', 'overlay', 'sku', 'skus', 'skuList', 'semanticTag', 'backgroundOptions', 'background-options', 'animations', 'globalAnimations', 'dispositions', 'callToAction', 'imageAction', '__typename']);

/** Walk content once: media stays at its source position, including inside paragraphs. */
export function extractArticleBlocks(html: string, base = 'https://robertsspaceindustries.com'): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const seenMedia = new Set<string>();
  const emitText = (text: string) => {
    const value = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (value) blocks.push({kind: 'text', text: value});
  };
  const emitMedia = (items: ArticleMedia[]) => {
    for (const media of items) {
      const key = media.embed || media.url;
      if (!seenMedia.has(key) && seenMedia.size < 40) {
        seenMedia.add(key);
        blocks.push({kind: 'media', media});
      }
    }
  };
  const mediaValue = (value: unknown, field: string) => {
    const element = new DOMParser().parseFromString('<g-component></g-component>', 'text/html').body.firstElementChild!;
    element.setAttribute(':properties', JSON.stringify({[field]: value}));
    return extractArticleMedia(element.outerHTML, base);
  };
  const structured = (value: unknown, field: string, depth: number, mediaContext = false): void => {
    if (depth > 24 || value == null) return;
    if (typeof value === 'string') {
      if (TEXT_FIELDS.has(field) && !mediaContext) scan(value, depth + 1, HEADINGS.has(field) ? '## ' : '');
      else emitMedia(mediaValue(value, field));
      return;
    }
    if (Array.isArray(value)) { value.forEach(entry => structured(entry, field, depth + 1, mediaContext)); return; }
    if (typeof value !== 'object') return;
    const record = value as Record<string, any>;
    if (record.displayed === false || record.isDisplayed === false || record.dispositions?.large?.display === false) return;
    if (record.originalFormat || record.webp || ['ImageObject', 'VideoObject'].includes(record['@type'])) {
      emitMedia(mediaValue(record, field));
      return;
    }
    // Responsive video sources represent one item, not three consecutive videos.
    if (mediaContext && record.desktop) { structured(record.desktop, field, depth + 1, true); return; }
    for (const [key, entry] of Object.entries(record)) {
      if (SKIP.has(key) || (record.isHeaderDeclared === false && ['title', 'overline', 'subtitle', 'introduction'].includes(key))) continue;
      structured(entry, key, depth + 1, mediaContext || ['media', 'background', 'picture', 'pictures', 'image', 'video'].includes(key));
    }
  };
  const scan = (markup: string, depth: number, prefix = ''): void => {
    if (depth > 24) return;
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    for (const node of doc.querySelectorAll('[data-platform-client-props]')) {
      try {
        const props = JSON.parse(node.getAttribute('data-platform-client-props') || '{}');
        const inline = props.routerParams?.props?.content?.html;
        if (props.routerParams?.component === 'AlexandriaPage' && typeof inline === 'string') { scan(inline, depth + 1); return; }
      } catch { /* Keep reading legacy content. */ }
    }
    // RSI store inventory requires their live storefront; retain a readable fallback.
    doc.querySelectorAll('rsi-store-component').forEach(node => {
      const fallback = doc.createElement('p');
      fallback.textContent = 'View featured offers on the original RSI article.';
      node.replaceWith(fallback);
    });
    doc.querySelectorAll('script, component[is="script"], rsi-store-component, style, nav, footer, header, noscript, [hidden], [aria-hidden="true"], .g-author').forEach(node => node.remove());
    const root = doc.querySelector('#layout-system, .alexandria-content-body, article') || doc.body;
    let buffer = '';
    let currentPrefix = prefix;
    const flush = () => {
      const value = buffer.replace(/\s+/g, ' ').trim().replace(/\s+([,.;:!?])/g, '$1');
      if (value) emitText(currentPrefix + value);
      buffer = '';
    };
    const visit = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) { buffer += node.textContent || ''; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;
      if (element.tagName === 'BR') { buffer += ' '; return; }
      if (['IMG', 'VIDEO', 'IFRAME', 'G-TRAILER'].includes(element.tagName)) {
        flush(); emitMedia(extractArticleMedia(element.outerHTML, base)); return;
      }
      // A video link is displayed where it occurs, without duplicating a later embed.
      if (element.tagName === 'A') {
        const media = extractArticleMedia(element.outerHTML, base);
        if (media.some(item => item.kind === 'embed')) { flush(); emitMedia(media); return; }
      }
      const attributes = element.getAttributeNames().filter(name => ATTRIBUTES.has(name) || ['body', 'content-body'].includes(name));
      if (attributes.length) {
        flush();
        for (const name of attributes) {
          const value = element.getAttribute(name)!;
          if (['body', 'content-body'].includes(name)) scan(value, depth + 1);
          else {
            try {
              const parsed = JSON.parse(value);
              const props = name === ':properties' ? (parsed?.componentProps ?? parsed) : parsed;
              const shop = parsed?.componentId === 'MiniGrid' ? merchandiseAction(props, base) : null;
              const start = blocks.length;
              structured(props, name.slice(1), depth + 1, [':media', ':picture', ':pictures'].includes(name));
              if (shop) {
                const section = blocks.splice(start);
                blocks.push({kind: 'promotion', ...shop,
                  text: section.filter(b => b.kind === 'text').filter(b => b.text !== shop.label).map(b => b.text).join('\n\n'),
                  media: section.filter(b => b.kind === 'media').map(b => b.media)});
              }
            } catch { /* Ignore malformed props without losing neighboring content. */ }
          }
        }
      }
      const isBlock = /^(H[1-6]|P|LI|BLOCKQUOTE|DIV|SECTION|UL|OL|FIGURE|FIGCAPTION)$/.test(element.tagName);
      const previousPrefix = currentPrefix;
      if (isBlock) {
        flush();
        currentPrefix = /^H[1-6]$/.test(element.tagName) ? '## ' : element.tagName === 'LI' ? '• ' : '';
      }
      element.childNodes.forEach(visit);
      if (isBlock) { flush(); currentPrefix = previousPrefix; }
    };
    root.childNodes.forEach(visit);
    flush();
  };
  scan(html, 0);
  return blocks;
}

export function articleDetail(blocks: ArticleBlock[], fallbackText = ''): ArticleDetail {
  if (!blocks.some(block => block.kind === 'text' || block.kind === 'promotion') && fallbackText) blocks = [{kind: 'text', text: fallbackText}, ...blocks];
  return {
    blocks,
    text: blocks.filter(block => block.kind === 'text' || block.kind === 'promotion').map(block => block.text).join('\n\n'),
    media: blocks.flatMap(block => block.kind === 'media' ? [block.media] : block.kind === 'promotion' ? block.media : [])
  };
}

/** Spectrum sometimes exposes only plain text plus unpositioned metadata images. */
export function spectrumArticleDetail(html: string, text: string, base: string): ArticleDetail {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const article = JSON.parse(script.textContent || '{}');
      if (article['@type'] !== 'DiscussionForumPosting' || typeof article.articleBody !== 'string') continue;
      const blocks = /<\/?(?:p|div|img|video|iframe|h[1-6]|ul|ol|li)\b/i.test(article.articleBody)
        ? extractArticleBlocks(article.articleBody, base) : [{kind: 'text' as const, text}];
      const placed = new Set(blocks.filter(block => block.kind === 'media').map(block => block.media.embed || block.media.url));
      // No position exists in this metadata. Keep it separate rather than inventing an order.
      const unpositionedMedia = extractArticleMedia(html, base).filter(item => !placed.has(item.embed || item.url));
      return {...articleDetail(blocks, text), unpositionedMedia};
    } catch { /* The caller already validated the article text. */ }
  }
  return articleDetail([{kind: 'text', text}]);
}

/** Group only source sections with an explicit merchandise action, never a guessed URL. */
function merchandiseAction(value: unknown, base: string, depth = 0): {url: string; label: string} | null {
  if (!value || typeof value !== 'object' || depth > 24) return null;
  const record = value as Record<string, any>;
  if (record.displayed === false || record.isDisplayed === false || record.dispositions?.large?.display === false) return null;
  if (record.action?.actionType === 'link' && typeof record.action.href === 'string' && typeof record.text === 'string') {
    const url = safeMediaUrl(record.action.href, base);
    if (url && /(?:merchandise|merch)(?:[/?#&]|$)/i.test(new URL(url).pathname + new URL(url).hash) && record.text.trim()) return {url, label: record.text.trim()};
  }
  for (const [key, child] of Object.entries(record)) {
    if (SKIP.has(key)) continue;
    const result = merchandiseAction(child, base, depth + 1);
    if (result) return result;
  }
  return null;
}
