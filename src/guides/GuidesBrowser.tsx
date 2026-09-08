import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, RefreshCw } from 'lucide-react';
import { usePersistentState } from '../state/usePersistentState';
import { openExternalUrl } from '../platform/openExternalUrl';
import { GuideContent } from './GuideContent';
import { fetchGuides, GUIDE_GROUPS, GUIDE_HOME, type Guide } from './service';

const CACHE = 'sc-companion:guides:v1';
interface Snapshot { guides: Guide[]; fetched: number }
function cached(): Snapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return value && Number.isFinite(value.fetched) && Array.isArray(value.guides) && value.guides.every((g: Guide) => typeof g.body === 'string' && typeof g.title === 'string' && typeof g.url === 'string') ? value : null;
  } catch { return null; }
}
export function GuidesBrowser() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(cached);
  const [query, setQuery] = usePersistentState('guides.query', '');
  const [group, setGroup] = usePersistentState('guides.group', '');
  const [expanded, setExpanded] = usePersistentState<number[]>('guides.expanded', []);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkError, setLinkError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => abort.abort(), 30_000);
    setLoading(true); setError('');
    void fetchGuides(abort.signal).then((guides) => {
      if (disposed) return;
      const next = { guides, fetched: Date.now() };
      setSnapshot(next);
      try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* Cache is optional. */ }
    }).catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Could not load RSI guides.'); })
      .finally(() => { window.clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; abort.abort(); window.clearTimeout(timeout); };
  }, [refresh]);
  function open(url: string) { void openExternalUrl(url).catch(() => setLinkError('Could not open this link. Use Open original guide to access its linked resources.')); }
  const matches = (snapshot?.guides || []).filter((guide) => (!group || guide.group === group) && guide.title.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="guides-browser">
    <header className="toolbar"><div><h2>Starter Guides</h2><span>Official RSI Knowledge Base{snapshot ? ` · Checked ${new Date(snapshot.fetched).toLocaleString()}` : ''}</span></div><button className="refresh-button" disabled={loading} onClick={() => setRefresh((v) => v + 1)}><RefreshCw size={17} />Refresh</button></header>
    <div className="guide-filters"><label>Search guides<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Guide title" /></label><label>Topic<select value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All topics</option>{GUIDE_GROUPS.map((name) => <option key={name}>{name}</option>)}</select></label><button className="settings-command" onClick={() => open(GUIDE_HOME)}>RSI New Players hub <ExternalLink size={15} /></button></div>
    <p className="player-market-note">{matches.length} guides · Guide dates are supplied by RSI. Game mechanics may change between patches.</p>
    {loading && <p role="status">Loading official guides...</p>}
    {(error || linkError) && <p role="alert" className="notice notice--error">{error || linkError}{error && snapshot ? ' Showing cached guides; media requires internet access.' : ''}</p>}
    {!loading && !matches.length && <p>No matching guides.</p>}
    {GUIDE_GROUPS.filter((name) => matches.some((guide) => guide.group === name)).map((name) => <section className="category-group guide-group" key={name}><h3>{name}</h3>{matches.filter((guide) => guide.group === name).map((guide) => <div className="guide-row" key={guide.id}>
      <button className="guide-summary" aria-expanded={expanded.includes(guide.id)} aria-controls={`guide-${guide.id}`} onClick={() => setExpanded((current) => current.includes(guide.id) ? current.filter((id) => id !== guide.id) : [...current, guide.id])}><span><strong>{guide.title}</strong><small>{Number.isFinite(Date.parse(guide.updated)) ? `Updated ${new Date(guide.updated).toLocaleDateString()}` : 'Update date unavailable'}</small></span><ChevronDown size={18} /></button>
      <div id={`guide-${guide.id}`} hidden={!expanded.includes(guide.id)}>{expanded.includes(guide.id) && <><button className="settings-command" onClick={() => open(guide.url)}>Open original guide <ExternalLink size={15} /></button><GuideContent body={guide.body} url={guide.url} open={open} /></>}</div>
    </div>)}</section>)}
  </section>;
}
