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
