import DOMPurify from 'dompurify';
import { useMemo, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

export function safeGuideUrl(value: string, base: string): string | null {
  try { const url = new URL(value, base); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function videoEmbed(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.replace(/^www\./, '');
    if (['youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
      const id = url.pathname.match(/\/(?:video\/)?(\d+)$/)?.[1];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch { /* Unsupported media stays a source link. */ }
  return null;
}
export function prepareGuide(body: string, base: string) {
  const doc = new DOMParser().parseFromString(body, 'text/html');
  const videos = new Map<string, string>();
  doc.querySelectorAll('iframe, a').forEach((node) => {
    const raw = node.getAttribute(node.tagName === 'A' ? 'href' : 'src') || '';
    const url = safeGuideUrl(raw, base);
    const embed = url && videoEmbed(url);
    if (embed && url) videos.set(embed, url);
    if (node.tagName === 'IFRAME') {
      const link = doc.createElement('a');
      if (url) { link.href = url; link.textContent = 'Open original media'; node.replaceWith(link); }
      else node.remove();
    }
  });
  doc.querySelectorAll('[href], [src]').forEach((node) => {
    for (const attr of ['href', 'src']) {
      const raw = node.getAttribute(attr);
      if (!raw || (attr === 'href' && raw.startsWith('#'))) continue;
      const url = safeGuideUrl(raw, base);
      if (url) node.setAttribute(attr, url); else node.removeAttribute(attr);
    }
  });
  doc.querySelectorAll('img').forEach((img) => { img.setAttribute('loading', 'lazy'); img.setAttribute('alt', img.getAttribute('alt') || 'RSI guide image'); });
  doc.querySelectorAll('video, audio').forEach((media) => media.setAttribute('controls', ''));
  const html = DOMPurify.sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS: ['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'br', 'hr', 'blockquote', 'pre', 'code', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'video', 'audio', 'source'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'id', 'colspan', 'rowspan', 'loading', 'controls', 'type'],
    ADD_ATTR: ['controls']
  });
  return { html, videos: [...videos].map(([embed, url]) => ({ embed, url })) };
}
export function GuideContent({ body, url, open }: { body: string; url: string; open: (url: string) => void }) {
  const content = useMemo(() => prepareGuide(body, url), [body, url]);
  const [playing, setPlaying] = useState<string[]>([]);
  return <>
    <div className="guide-content" onClick={(event) => {
      const link = (event.target as Element).closest('a');
      if (!link) return;
      event.preventDefault();
      const href = link.getAttribute('href');
      if (href?.startsWith('#')) {
        const target = [...event.currentTarget.querySelectorAll('[id]')].find((node) => node.id === href.slice(1));
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (href) open(href);
    }} dangerouslySetInnerHTML={{ __html: content.html }} />
    {content.videos.map((video, index) => <div className="guide-video" key={video.embed}>
      {playing.includes(video.embed) ? <iframe title={`Guide video ${index + 1}`} src={video.embed} referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" /> : <button className="refresh-button" onClick={() => setPlaying((current) => [...current, video.embed])}><Play size={18} />Play video {index + 1}</button>}
      <button className="settings-command" onClick={() => open(video.url)}>Open original video <ExternalLink size={14} /></button>
    </div>)}
  </>;
}
