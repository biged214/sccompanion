import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { usePersistentState } from '../state/usePersistentState';
import { openExternalUrl } from '../platform/openExternalUrl';
import { acquisition, blueprintDetail, blueprintSource, cachedBlueprints, cachedDetail, fetchBlueprints, materialQuantity, wikiJson, type Blueprint, type Material, type Requirement, type Version } from './service';
import './blueprints.css';
import { MissionDetails } from './MissionDetails';

export function BlueprintsBrowser() {
  const [snapshot, setSnapshot] = useState(cachedBlueprints);
  const [version, setVersion] = usePersistentState('blueprints.version', '');
  const [query, setQuery] = usePersistentState('blueprints.query', '');
  const [category, setCategory] = usePersistentState('blueprints.category', 'all');
  const [collection, setCollection] = usePersistentState('blueprints.collection', 'all');
  const [availability, setAvailability] = usePersistentState('blueprints.availability', 'all');
  const [sort, setSort] = usePersistentState('blueprints.sort', 'name');
  const [owned, setOwned] = usePersistentState<string[]>('blueprints.owned', []);
  const [wanted, setWanted] = usePersistentState<string[]>('blueprints.wanted', []);
  const [expanded, setExpanded] = usePersistentState<string[]>('blueprints.expanded', []);
  const [limit, setLimit] = useState(50);
  const [versions, setVersions] = useState<Version[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    wikiJson('/game-versions?page[size]=200', controller.signal).then(data => {
      if (!controller.signal.aborted && Array.isArray(data.data)) setVersions(data.data.filter((v: Version) => typeof v.code === 'string'));
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setProgress(0);
    fetchBlueprints(version, controller.signal, n => { if (!controller.signal.aborted) setProgress(n); })
      .then(data => { if (!controller.signal.aborted) setSnapshot(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load blueprints.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version, reload]);
  useEffect(() => setLimit(50), [query, category, collection, availability, sort, version]);
  const current = snapshot && (!version || snapshot.version === version) ? snapshot : null;
  const categories = useMemo(() => [...new Set(current?.blueprints.map(b => b.output?.type_label || 'Uncategorized') || [])].sort(), [current]);
  const filtered = useMemo(() => (current?.blueprints || []).filter(b => {
    const search = `${b.output_name} ${b.ingredients.map(m => m.name).join(' ')}`.toLowerCase();
    return search.includes(query.trim().toLowerCase()) && (category === 'all' || (b.output?.type_label || 'Uncategorized') === category)
      && (collection === 'all' || (collection === 'owned' ? owned : wanted).includes(b.uuid))
      && (availability === 'all' || acquisition(b) === availability);
  }).sort((a, b) => sort === 'time' ? (a.craft_time_seconds ?? Infinity) - (b.craft_time_seconds ?? Infinity) || a.output_name.localeCompare(b.output_name) : a.output_name.localeCompare(b.output_name)), [current, query, category, collection, availability, owned, wanted, sort]);
  function toggle(id: string, list: string[], set: (next: string[]) => void) { set(list.includes(id) ? list.filter(v => v !== id) : [...list, id]); }
  return <section className="blueprints-view" aria-label="Blueprint database">
    <div className="section-heading"><div><p className="eyebrow">Star Citizen Wiki</p><h2>Blueprints</h2></div><button className="refresh-button" disabled={loading} onClick={() => setReload(n => n + 1)}><RefreshCw size={17} className={loading ? 'spin' : ''} />Refresh</button></div>
    <div className="bp-filters">
      <label className="bp-search">Search<Search size={16} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Blueprint or ingredient" /></label>
      <label>Game version<select value={version} onChange={e => setVersion(e.target.value)}><option value="">Current default</option>{[...new Set([...versions.map(v => v.code), ...(version ? [version] : [])])].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{[...new Set([...categories, ...(category !== 'all' ? [category] : [])])].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Collection<select value={collection} onChange={e => setCollection(e.target.value)}><option value="all">All blueprints</option><option value="owned">Owned</option><option value="wanted">Wanted</option></select></label>
      <label>Acquisition<select value={availability} onChange={e => setAvailability(e.target.value)}><option value="all">All sources</option>{['Available by default', 'Mission-linked', 'Acquisition unknown'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Sort<select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name A-Z</option><option value="time">Craft time: shortest first</option></select></label>
    </div>
    <p className="bp-meta" role="status">{loading ? `Loading blueprints (${progress.toLocaleString()} received)...` : `${filtered.length.toLocaleString()} results`}{current && ` | ${current.version} | Updated ${new Date(current.fetchedAt).toLocaleString()}`}</p>
    {error && <p className="bp-error" role="alert">{error}{current ? ' Showing cached data.' : ''}</p>}
    <p className="bp-meta">Game-file reference data. Mission links do not guarantee current availability or a specific reward. Owned and Wanted are your local checklist.</p>
    {!loading && !filtered.length && <p>No matching blueprints. Change the filters or refresh the database.</p>}
    <div className="bp-list">{filtered.slice(0, limit).map(b => <article className="bp-row" key={`${b.game_version}:${b.uuid}`}>
      <div className="bp-row-heading"><div><h3>{b.output_name}</h3><p>{b.output?.type_label || 'Uncategorized'} | {time(b.craft_time_seconds)} | {acquisition(b)}{b.output?.grade ? ` | Grade ${b.output.grade}` : ''}</p></div><div className="bp-checks"><label><input type="checkbox" checked={owned.includes(b.uuid)} onChange={() => toggle(b.uuid, owned, setOwned)} />Owned</label><label><input type="checkbox" checked={wanted.includes(b.uuid)} onChange={() => toggle(b.uuid, wanted, setWanted)} />Wanted</label></div></div>
      <details open={expanded.includes(b.uuid)} onToggle={e => { const open = e.currentTarget.open; if (open !== expanded.includes(b.uuid)) setExpanded(list => open ? [...list, b.uuid] : list.filter(id => id !== b.uuid)); }}><summary>Recipe &amp; acquisition</summary>{expanded.includes(b.uuid) && <BlueprintDetails blueprint={b} />}</details>
    </article>)}</div>
    {limit < filtered.length && <button className="refresh-button" onClick={() => setLimit(n => n + 50)}>Load more ({filtered.length - limit} remaining)</button>}
  </section>;
}
function time(seconds: number | null | undefined) { return typeof seconds === 'number' ? `${(seconds / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} min` : 'Craft time unknown'; }
function Materials({ items }: { items: Material[] }) { return items.length ? <table><thead><tr><th>Material</th><th>Required amount</th></tr></thead><tbody>{items.map((m, i) => <tr key={i}><td>{m.name}</td><td>{materialQuantity(m)}</td></tr>)}</tbody></table> : <p>Material data not supplied.</p>; }
function Requirements({ nodes, depth = 0 }: { nodes: Requirement[]; depth?: number }) {
  if (depth > 8) return <p>Additional nesting: see source.</p>;
  return <ul>{nodes.map((r, i) => <li key={i}><strong>{r.name || 'Requirements'}</strong>{r.children?.length ? `: ${r.required_count == null ? 'Required inputs' : `Select ${r.required_count} of ${r.children.length}`}` : `: ${materialQuantity(r)}`}{typeof r.min_quality === 'number' && `; minimum quality ${r.min_quality}`}{r.modifiers?.map((m, j) => <p key={j}>{m.label || m.name || 'Quality effect'}{m.modifier_range && `: ${m.modifier_range.at_min_quality}x at minimum quality to ${m.modifier_range.at_max_quality}x at maximum quality`}</p>)}{r.children?.length ? <Requirements nodes={r.children} depth={depth + 1} /> : null}</li>)}</ul>;
}
function BlueprintDetails({ blueprint }: { blueprint: Blueprint }) {
  const [detail, setDetail] = useState(() => cachedDetail(blueprint));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    blueprintDetail(blueprint, controller.signal).then(d => { if (!controller.signal.aborted) setDetail(d); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [blueprint, reload]);
  const b = detail || blueprint;
  return <div className="bp-detail"><h4>Ingredients</h4><Materials items={b.ingredients} />
    {loading && <p role="status">Loading acquisition and quality details...</p>}{error && <p role="alert">{error} {detail ? 'Showing cached details.' : 'Acquisition details could not be checked.'} <button onClick={() => setReload(n => n + 1)}>Retry</button></p>}
    <h4>How to obtain</h4>{b.is_available_by_default && <p>Available by default according to this game version.</p>}
    {b.unlocking_missions?.length ? <ul>{b.unlocking_missions.map((m, i) => <li key={i}>{m.title || 'Unnamed mission'}{m.reward_scope ? ` (${m.reward_scope})` : ''}<MissionDetails url={m.web_url} version={b.game_version} /></li>)}</ul> : <p>{b.is_available_by_default ? 'No additional mission source supplied.' : detail ? 'Acquisition unknown: no unlocking missions supplied.' : 'Mission details not loaded.'}</p>}
    {!!b.requirement_groups?.length && <><h4>Quality &amp; input choices</h4><Requirements nodes={b.requirement_groups} /></>}
    {(b.tiers?.length || 0) > 1 && <><h4>Additional tiers</h4>{b.tiers?.map(t => <details key={t.tier_index}><summary>Tier index {t.tier_index} | {time(t.craft_time_seconds)}</summary>{t.requirements && <Requirements nodes={[t.requirements]} />}</details>)}</>}
    {!!b.dismantle_returns.length && <><h4>Dismantle returns</h4><Materials items={b.dismantle_returns} /></>}
    <a href={blueprintSource(b)} target="_blank" rel="noreferrer" onClick={e => { if (window.__TAURI_INTERNALS__) { e.preventDefault(); void openExternalUrl(blueprintSource(b)).catch(() => setError('Could not open the source in your browser.')); } }}>Open blueprint on Star Citizen Wiki <ExternalLink size={14} /></a>
  </div>;
}
