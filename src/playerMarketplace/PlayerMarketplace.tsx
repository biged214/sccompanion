import { ChevronDown, ExternalLink, Package, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { usePersistentState } from '../state/usePersistentState';
import { listingProviders, transactionLabel, type PlayerListing } from './service';

interface Snapshot { listings: PlayerListing[]; fetchedAt: number }
const CACHE = 'sc-companion:player-marketplace:v3:';
export function PlayerMarketplace() {
  const [query, setQuery] = usePersistentState('player-market.query', '');
  const [searchQuery, setSearchQuery] = useState(query.trim().toLowerCase());
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim().toLowerCase()), 600);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [transaction, setTransaction] = usePersistentState('player-market.transaction', '');
  const [seller, setSeller] = usePersistentState('player-market.seller', '');
  const [sellerDraft, setSellerDraft] = useState(seller);
  const [system, setSystem] = usePersistentState('player-market.system', '');
  const [location, setLocation] = usePersistentState('player-market.location', '');
  const [currency, setCurrency] = usePersistentState('player-market.currency', '');
  const [sort, setSort] = usePersistentState('player-market.sort', 'newest');
  const [count, setCount] = useState(40);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshId, setRefreshId] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [linkError, setLinkError] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()); setRefreshId((value) => value + 1); }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setCount(40);
  }, [query, seller, system, location, currency, sort, transaction]);
  useEffect(() => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    let disposed = false;
    const key = CACHE + JSON.stringify([seller.toLowerCase(), searchQuery]);
    setSnapshot(null);
    try {
      const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as Snapshot | null;
      if (cached && Array.isArray(cached.listings) && Number.isFinite(cached.fetchedAt)) setSnapshot(cached);
    } catch { /* Cache is optional. */ }
    setLoading(true); setError('');
    const timeout = window.setTimeout(() => abort.abort(), 60_000);
    void Promise.allSettled(listingProviders.map((provider) => provider.load(seller, abort.signal, searchQuery))).then((results) => {
      if (disposed) return;
      const listings: PlayerListing[] = [];
      const errors: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') listings.push(...result.value);
        else errors.push(`${listingProviders[index].name}: ${result.reason instanceof Error ? result.reason.message : 'Unable to load listings.'}`);
      });
      if (results.some((result) => result.status === 'fulfilled')) {
        const next = { listings: [...new Map(listings.map((row) => [row.id, row])).values()], fetchedAt: Date.now() };
        setSnapshot(next); setNow(Date.now());
        if (!errors.length) try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage may be full. */ }
      }
      setError(errors.join(' ')); setLoading(false);
    }).finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; abort.abort(); window.clearTimeout(timeout); };
  }, [seller, refreshId, searchQuery]);

  const rows = snapshot?.listings ?? [];
  const filtered = useMemo(() => rows.filter((row) =>
    (!row.expires || row.expires > now) &&
    (!transaction || row.transaction === transaction) &&
    (!system || row.system === system) && (!location || row.location === location) &&
    (!currency || row.currency === currency) &&
    `${row.title} ${row.description} ${row.seller}`.toLowerCase().includes(query.trim().toLowerCase())
  ).sort((a, b) => {
    if (sort === 'newest') return b.added - a.added;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    if (a.price === null) return b.price === null ? 0 : 1;
    if (b.price === null) return -1;
    return sort === 'price-low' ? a.price - b.price : b.price - a.price;
  }), [rows, query, system, location, currency, sort, now, transaction]);

  async function open(url: string) {
    try { await openExternalUrl(url); setLinkError(''); }
    catch { setLinkError('Could not open the marketplace in your browser.'); }
  }
  return <section className="player-market">
    <header className="toolbar">
      <div><h2>Player Marketplace</h2><span>{snapshot ? `Fetched ${new Date(snapshot.fetchedAt).toLocaleString()}` : 'Player buy and sell listings'}</span></div>
      <button className="refresh-button" disabled={loading} onClick={() => setRefreshId((value) => value + 1)}><RefreshCw size={17} className={loading ? 'spin' : ''} />Refresh</button>
    </header>
    <div className="player-market-sources">
      <span>Listing feed: UEX Corp</span>
      <button className="settings-command" onClick={() => void open('https://uexcorp.space/marketplace')}>UEX marketplace <ExternalLink size={14} /></button>
      <button className="settings-command" onClick={() => void open('https://sc-market.space/')}>SC Market (external) <ExternalLink size={14} /></button>
    </div>
    <form className="player-market-seller" onSubmit={(event) => { event.preventDefault(); setSeller(sellerDraft.trim()); setRefreshId((value) => value + 1); }}>
      <label>UEX player handle<input value={sellerDraft} onChange={(event) => setSellerDraft(event.target.value)} placeholder="Any player" /></label>
      <button className="refresh-button" disabled={loading}><Search size={16} />Find player</button>
    </form>
    <div className="player-market-filters">
      <label>Search listings<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Item or player" /></label>
      <label>Transaction<select value={transaction} onChange={(event) => setTransaction(event.target.value)}><option value="">All transactions</option>{[...new Set(['sell', 'buy', ...rows.map((row) => row.transaction), ...(transaction ? [transaction] : [])])].map((operation) => <option key={operation} value={operation}>{transactionLabel(operation)}</option>)}</select></label>
      {([['System', system, setSystem, 'system'], ['Location', location, setLocation, 'location'], ['Currency', currency, setCurrency, 'currency']] as const).map(([label, value, setter, field]) =>
        <label key={label}>{label}<select value={value} onChange={(event) => setter(event.target.value)}><option value="">All</option>{[...new Set([...rows.map((row) => row[field]), ...(value ? [value] : [])])].sort().map((option) => <option key={option}>{option}</option>)}</select></label>)}
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
    </div>
    <p className="player-market-note">{filtered.length} matching listings from {rows.length} loaded listings. Searches expand buy/sell results for item IDs found in matching recent titles. Items absent from the recent feed and unlinked listings may be missing; UEX also caps item results. Prices are advertiser asks or offers, grouped by currency when sorting.</p>
    <button className="settings-command" onClick={() => void open(`https://uexcorp.space/marketplace/home/?search=${encodeURIComponent(query.trim())}`)}>Search on UEX <ExternalLink size={14} /></button>
    {(error || linkError) && <p role="alert" className="notice notice--error">{error || linkError}{error && snapshot ? ' Showing cached listings.' : ''}</p>}
    {(loading || searchQuery !== query.trim().toLowerCase()) && <p role="status">Loading player listings...</p>}
    {!loading && !filtered.length && <p>No matching listings. Try another search, player, or transaction type.</p>}
    <div className="player-market-list">
      {filtered.slice(0, count).map((row) => <details className="player-listing" key={row.id}>
        <summary>
          {row.photos[0] ? <img loading="lazy" src={row.photos[0]} alt={row.title} onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /> : <Package size={36} />}
          <div><span className="player-transaction" data-operation={row.transaction}>{transactionLabel(row.transaction)}</span><strong>{row.title}</strong><span>{row.seller} · {row.system} · {row.location}</span><small>UEX Corp · {row.added ? new Date(row.added).toLocaleString() : 'Date unavailable'}</small></div>
          <div className="player-listing-price"><strong>{row.price === null ? 'Price unspecified' : `${row.price.toLocaleString()} ${row.currency}`}</strong><span>{row.unit ? `Per ${row.unit} · ` : ''}{row.transaction === 'sell' ? `Stock: ${row.stock ?? 'Unknown'}` : row.transaction === 'buy' ? 'Buyer offer' : 'Listed price'} <ChevronDown size={14} aria-hidden="true" /></span></div>
        </summary>
        <div className="player-listing-details">
          <p>Availability: {row.availability} · Origin: {row.origin}</p>
          <p className="player-listing-description">{row.description || 'No description provided.'}</p>
          <div className="player-listing-photos">{row.photos.slice(1).map((photo) => <img loading="lazy" key={photo} src={photo} alt={row.title} />)}</div>
          <p>{row.expires ? `Expires ${new Date(row.expires).toLocaleString()}` : 'Expiration unspecified'}</p>
          <button className="settings-command" onClick={() => void open(row.url)}>View listing / contact player <ExternalLink size={15} /></button>
        </div>
      </details>)}
    </div>
    {count < filtered.length && <button className="refresh-button" onClick={() => setCount((value) => value + 40)}>Show more ({filtered.length - count} remaining)</button>}
  </section>;
}
