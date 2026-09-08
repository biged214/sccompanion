export interface Guide { id: number; title: string; body: string; url: string; updated: string; group: string }
export const GUIDE_GROUPS = ['Getting Started', 'Ships & Travel', 'Activities', 'Equipment & Daily Life', 'Community'];
export const GUIDE_HOME = 'https://support.robertsspaceindustries.com/hc/en-us/categories/360000783053-New-Players';
const ORIGIN = 'https://support.robertsspaceindustries.com';
export function guideGroup(title: string): string {
  if (/friends|multiplayer|involved|galactapedia|welcome hub/i.test(title)) return 'Community';
  if (/ship|vehicle|land your|locations|now leaving/i.test(title)) return 'Ships & Travel';
  if (/commodit|mission|contract|currenc/i.test(title)) return 'Activities';
  if (/equipping|shopping|daily life/i.test(title)) return 'Equipment & Daily Life';
  return 'Getting Started';
}
export async function fetchGuides(signal: AbortSignal): Promise<Guide[]> {
  const fetcher = window.__TAURI_INTERNALS__ ? (await import('@tauri-apps/plugin-http')).fetch : window.fetch.bind(window);
  let next: string | null = `${ORIGIN}/api/v2/help_center/en-us/categories/360000783053/articles.json?per_page=100`;
  const guides = new Map<number, Guide>();
  const visited = new Set<string>();
  while (next) {
    const url: URL = new URL(next);
    if (url.origin !== ORIGIN || !url.pathname.startsWith('/api/v2/help_center/en-us/') || visited.has(next) || visited.size >= 20) throw new Error('Unexpected RSI guide pagination.');
    visited.add(next);
    const response = await fetcher(window.__TAURI_INTERNALS__ ? next : `/api/rsi-guides${url.pathname}${url.search}`, { signal });
    if (!response.ok) throw new Error(`RSI guides returned ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data.articles)) throw new Error('RSI returned an invalid guide response.');
    for (const article of data.articles) {
      if (article.draft || typeof article.title !== 'string' || typeof article.body !== 'string' || !Number.isSafeInteger(article.id)) continue;
      guides.set(article.id, { id: article.id, title: article.title, body: article.body,
        url: `${ORIGIN}/hc/en-us/articles/${article.id}`, updated: typeof article.updated_at === 'string' ? article.updated_at : '', group: guideGroup(article.title) });
    }
    next = typeof data.next_page === 'string' ? data.next_page : null;
  }
  return [...guides.values()];
}
