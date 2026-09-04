import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, PackageSearch, RefreshCw, Search, Store } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeLocationDisplayName } from '../locations/displayNames';
import { usePersistentState } from '../state/usePersistentState';
import type { CommodityPrice, TradeMarketSnapshot, TradeTerminal } from '../tradeRoutes/types';

const PAGE_SIZE = 75;

type MarketSort = 'commodity' | 'buy' | 'sell' | 'supply' | 'demand' | 'updated';
type SortDirection = 'asc' | 'desc';
type MarketAvailability = 'all' | 'buy' | 'sell' | 'both';

interface MarketListing {
  id: string;
  price: CommodityPrice;
  terminal: TradeTerminal;
}

export function MarketBrowser({
  snapshot,
  isLoading,
  error,
  usingCache,
  onRefresh
}: {
  snapshot: TradeMarketSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = usePersistentState('market.query', '');
  const [systemId, setSystemId] = usePersistentState('market.system', '');
  const [location, setLocation] = usePersistentState('market.location', '');
  const [availability, setAvailability] = usePersistentState<MarketAvailability>('market.availability', 'all');
  const [sort, setSort] = usePersistentState<MarketSort>('market.sort', 'commodity');
  const [direction, setDirection] = usePersistentState<SortDirection>('market.direction', 'asc');
  const [visibleCount, setVisibleCount] = usePersistentState('market.visible-count', PAGE_SIZE);
  const filtersMounted = useRef(false);

  useEffect(() => {
    const friendlyLocation = normalizeLocationDisplayName(location);
    if (friendlyLocation !== location) setLocation(friendlyLocation);
  }, [location, setLocation]);

  const terminals = useMemo(() => new Map(snapshot?.terminals.map((terminal) => [terminal.id, terminal]) ?? []), [snapshot]);
  const locations = useMemo(() => {
    if (!snapshot) return [];
    const selectedSystemId = systemId ? Number(systemId) : null;
    return [...new Set(snapshot.terminals
      .filter((terminal) => selectedSystemId === null || terminal.systemId === selectedSystemId)
      .map((terminal) => terminal.location))]
      .sort((left, right) => left.localeCompare(right));
  }, [snapshot, systemId]);

  const listings = useMemo(() => {
    if (!snapshot) return [];
    const normalizedQuery = query.trim().toLowerCase();
    const selectedSystemId = systemId ? Number(systemId) : null;
    const filtered: MarketListing[] = [];

    snapshot.prices.forEach((price) => {
      const terminal = terminals.get(price.terminalId);
      if (!terminal) return;
      if (normalizedQuery && !price.commodityName.toLowerCase().includes(normalizedQuery)) return;
      if (selectedSystemId !== null && terminal.systemId !== selectedSystemId) return;
      if (location && terminal.location !== location) return;
      if (availability === 'buy' && price.buyPrice <= 0) return;
      if (availability === 'sell' && price.sellPrice <= 0) return;
      if (availability === 'both' && (price.buyPrice <= 0 || price.sellPrice <= 0)) return;
      filtered.push({ id: `${price.commodityId}-${price.terminalId}`, price, terminal });
    });

    return filtered.sort((left, right) => compareListings(left, right, sort, direction));
  }, [availability, direction, location, query, snapshot, sort, systemId, terminals]);

  const commodityCount = useMemo(() => new Set(listings.map((listing) => listing.price.commodityId)).size, [listings]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setVisibleCount(PAGE_SIZE);
  }, [availability, direction, location, query, setVisibleCount, sort, systemId]);

  function changeSystem(value: string) {
    setSystemId(value);
    setLocation('');
  }

  function changeSort(nextSort: MarketSort) {
    if (sort === nextSort) {
      setDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSort(nextSort);
    setDirection(nextSort === 'commodity' || nextSort === 'buy' ? 'asc' : 'desc');
  }

  return (
    <section className="market-browser">
      <div className="section-heading market-heading">
        <div>
          <p className="eyebrow">Commodity Exchange</p>
          <h2>Market</h2>
        </div>
        <p>Browse current commodity prices, stock, demand, locations, and cargo services reported by UEX.</p>
      </div>

      <section className="market-filters" aria-label="Market filters">
        <label className="market-search">
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commodities" aria-label="Search commodities" />
        </label>
        <label className="market-filter-select">
          <span>System</span>
          <select value={systemId} onChange={(event) => changeSystem(event.target.value)}>
            <option value="">All systems</option>
            {snapshot?.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </label>
        <label className="market-filter-select">
          <span>Location</span>
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="">All locations</option>
            {locations.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="market-filter-select">
          <span>Availability</span>
          <select value={availability} onChange={(event) => setAvailability(event.target.value as MarketAvailability)}>
            <option value="all">Buy or sell</option>
            <option value="buy">Available to buy</option>
            <option value="sell">Accepted for sale</option>
            <option value="both">Both buy and sell</option>
          </select>
        </label>
      </section>

      {error && (
        <section className="notice notice--error" role="alert">
          <RefreshCw size={19} aria-hidden="true" />
          <div><strong>Market refresh failed</strong><span>{error}</span>{usingCache && <span>Showing saved market data.</span>}</div>
        </section>
      )}
      {isLoading && !snapshot && (
        <section className="notice"><RefreshCw size={19} className="spin" aria-hidden="true" /><div><strong>Loading commodity markets</strong><span>Fetching live prices, stock, demand, locations, and terminal capabilities.</span></div></section>
      )}

      {snapshot && (
        <section className="market-results">
          <div className="market-results__summary">
            <div><Store size={18} aria-hidden="true" /><strong>{formatNumber(listings.length)} market listings</strong><span>{formatNumber(commodityCount)} commodities</span></div>
            <button type="button" className="refresh-button" onClick={() => void onRefresh()} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spin' : undefined} aria-hidden="true" /> Refresh markets
            </button>
          </div>

          {listings.length > 0 ? (
            <div className="market-table" role="table" aria-label="Commodity market listings">
              <div className="market-table__head" role="row">
                <SortHeader label="Commodity" field="commodity" current={sort} direction={direction} onSort={changeSort} />
                <span role="columnheader">Terminal and location</span>
                <span role="columnheader">System</span>
                <SortHeader label="Buy price" field="buy" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Sell price" field="sell" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Supply" field="supply" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Demand" field="demand" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label="Updated" field="updated" current={sort} direction={direction} onSort={changeSort} />
                <span aria-hidden="true" />
              </div>
              {listings.slice(0, visibleCount).map((listing) => <MarketRow key={listing.id} listing={listing} />)}
            </div>
          ) : (
            <section className="trade-empty">
              <PackageSearch size={28} aria-hidden="true" />
              <strong>No market listings match these filters</strong>
              <span>Try another commodity name, location, system, or availability option.</span>
            </section>
          )}

          {visibleCount < listings.length && (
            <div className="load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more listings</button></div>
          )}
        </section>
      )}
    </section>
  );
}

function SortHeader({
  label,
  field,
  current,
  direction,
  onSort
}: {
  label: string;
  field: MarketSort;
  current: MarketSort;
  direction: SortDirection;
  onSort: (field: MarketSort) => void;
}) {
  const active = current === field;
  const Icon = active ? direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
  return (
    <button type="button" className={active ? 'market-sort market-sort--active' : 'market-sort'} onClick={() => onSort(field)} role="columnheader">
      {label}<Icon size={13} aria-hidden="true" />
    </button>
  );
}

function MarketRow({ listing }: { listing: MarketListing }) {
  const [expanded, setExpanded] = useState(false);
  const { price, terminal } = listing;
  return (
    <article className={`market-row${expanded ? ' market-row--expanded' : ''}`} role="rowgroup">
      <button type="button" className="market-row__summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} role="row">
        <span data-label="Commodity" role="cell"><strong>{price.commodityName}</strong><small>ID {price.commodityId}</small></span>
        <span data-label="Terminal" role="cell"><strong>{terminal.name}</strong><small>{terminal.location}</small></span>
        <span data-label="System" role="cell"><strong>{terminal.systemName}</strong></span>
        <span data-label="Buy price" role="cell" className="market-price market-price--buy"><strong>{formatPrice(price.buyPrice)}</strong><small>{price.buyPrice > 0 ? 'per SCU' : 'Not sold here'}</small></span>
        <span data-label="Sell price" role="cell" className="market-price market-price--sell"><strong>{formatPrice(price.sellPrice)}</strong><small>{price.sellPrice > 0 ? 'per SCU' : 'Not accepted'}</small></span>
        <span data-label="Supply" role="cell"><strong>{formatAvailability(price.supply)}</strong><small>SCU</small></span>
        <span data-label="Demand" role="cell"><strong>{formatAvailability(price.demand)}</strong><small>SCU</small></span>
        <span data-label="Updated" role="cell"><strong>{formatRelativeTime(price.updatedAt)}</strong><small>{formatDate(price.updatedAt)}</small></span>
        <ChevronDown className="market-row__chevron" size={18} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="market-row__details" role="row">
          <MarketDetail label="Market role" value={formatMarketRole(price)} detail={`Buy ${formatPrice(price.buyPrice)} · Sell ${formatPrice(price.sellPrice)}`} />
          <MarketDetail label="Inventory" value={`${formatNumber(price.supply)} SCU supply`} detail={`${formatNumber(price.demand)} SCU demand`} />
          <MarketDetail label="Container sizes" value={formatContainerSizes(price.containerSizes)} detail={terminal.maxContainerSize > 0 ? `Terminal maximum: ${terminal.maxContainerSize} SCU` : 'Terminal maximum not reported'} />
          <MarketDetail label="Cargo services" value={terminal.supportsAutoload ? 'Autoload available' : 'Manual handling'} detail={formatCargoServices(terminal)} />
          <MarketDetail label="Location" value={terminal.name} detail={`${terminal.location}, ${terminal.systemName}`} />
          <MarketDetail label="Report timestamp" value={formatDate(price.updatedAt)} detail="Community-maintained UEX market report" />
        </div>
      )}
    </article>
  );
}

function MarketDetail({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div role="cell"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function compareListings(left: MarketListing, right: MarketListing, sort: MarketSort, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1;
  if (sort === 'commodity') return multiplier * left.price.commodityName.localeCompare(right.price.commodityName) || left.terminal.name.localeCompare(right.terminal.name);
  if (sort === 'updated') return multiplier * (Date.parse(left.price.updatedAt) - Date.parse(right.price.updatedAt)) || left.price.commodityName.localeCompare(right.price.commodityName);
  if (sort === 'buy') return compareOptionalPrices(left.price.buyPrice, right.price.buyPrice, multiplier) || left.price.commodityName.localeCompare(right.price.commodityName);
  if (sort === 'sell') return compareOptionalPrices(left.price.sellPrice, right.price.sellPrice, multiplier) || left.price.commodityName.localeCompare(right.price.commodityName);
  const leftValue = sort === 'supply' ? left.price.supply : left.price.demand;
  const rightValue = sort === 'supply' ? right.price.supply : right.price.demand;
  return multiplier * (leftValue - rightValue) || left.price.commodityName.localeCompare(right.price.commodityName);
}

function compareOptionalPrices(left: number, right: number, multiplier: number): number {
  if (left <= 0 && right > 0) return 1;
  if (right <= 0 && left > 0) return -1;
  return multiplier * (left - right);
}

function formatMarketRole(price: CommodityPrice): string {
  if (price.buyPrice > 0 && price.sellPrice > 0) return 'Buys and sells';
  if (price.buyPrice > 0) return 'Purchase location';
  if (price.sellPrice > 0) return 'Sell location';
  return 'No active market';
}

function formatCargoServices(terminal: TradeTerminal): string {
  const services = [
    terminal.hasFreightElevator ? 'freight elevator' : '',
    terminal.hasLoadingDock ? 'loading dock' : '',
    terminal.hasDockingPort ? 'docking port' : ''
  ].filter(Boolean);
  return services.length > 0 ? services.join(' · ') : 'No cargo services reported';
}

function formatContainerSizes(sizes: number[]): string {
  return sizes.length > 0 ? `${sizes.join(', ')} SCU` : 'Not reported';
}

function formatPrice(value: number): string {
  return value > 0 ? `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} aUEC` : 'Not available';
}

function formatAvailability(value: number): string {
  return value > 0 ? formatNumber(value) : 'None';
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Just now';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
