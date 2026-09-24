import { t, locale } from '../i18n';
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
          <p className="eyebrow">{t("Commodity Exchange")}</p>
          <h2>{t("Market")}</h2>
        </div>
        <p>{t("Browse current commodity prices, stock, demand, locations, and cargo services reported by UEX.")}</p>
      </div>

      <section className="market-filters" aria-label={t("Market filters")}>
        <label className="market-search">
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search commodities")} aria-label={t("Search commodities")} />
        </label>
        <label className="market-filter-select">
          <span>{t("System")}</span>
          <select value={systemId} onChange={(event) => changeSystem(event.target.value)}>
            <option value="">{t("All systems")}</option>
            {snapshot?.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </label>
        <label className="market-filter-select">
          <span>{t("Location")}</span>
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="">{t("All locations")}</option>
            {locations.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="market-filter-select">
          <span>{t("Availability")}</span>
          <select value={availability} onChange={(event) => setAvailability(event.target.value as MarketAvailability)}>
            <option value="all">{t("Buy or sell")}</option>
            <option value="buy">{t("Available to buy")}</option>
            <option value="sell">{t("Accepted for sale")}</option>
            <option value="both">{t("Both buy and sell")}</option>
          </select>
        </label>
      </section>

      {error && (
        <section className="notice notice--error" role="alert">
          <RefreshCw size={19} aria-hidden="true" />
          <div><strong>{t("Market refresh failed")}</strong><span>{error}</span>{usingCache && <span>{t("Showing saved market data.")}</span>}</div>
        </section>
      )}
      {isLoading && !snapshot && (
        <section className="notice"><RefreshCw size={19} className="spin" aria-hidden="true" /><div><strong>{t("Loading commodity markets")}</strong><span>{t("Fetching live prices, stock, demand, locations, and terminal capabilities.")}</span></div></section>
      )}

      {snapshot && (
        <section className="market-results">
          <div className="market-results__summary">
            <div><Store size={18} aria-hidden="true" /><strong>{formatNumber(listings.length)} {t("market listings")}</strong><span>{formatNumber(commodityCount)} {t("commodities")}</span></div>
            <button type="button" className="refresh-button" onClick={() => void onRefresh()} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spin' : undefined} aria-hidden="true" /> {t("Refresh markets")} </button>
          </div>

          {listings.length > 0 ? (
            <div className="market-table" role="table" aria-label={t("Commodity market listings")}>
              <div className="market-table__head" role="row">
                <SortHeader label={t("Commodity")} field="commodity" current={sort} direction={direction} onSort={changeSort} />
                <span role="columnheader">{t("Terminal and location")}</span>
                <span role="columnheader">{t("System")}</span>
                <SortHeader label={t("Buy price")} field="buy" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label={t("Sell price")} field="sell" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label={t("Supply")} field="supply" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label={t("Demand")} field="demand" current={sort} direction={direction} onSort={changeSort} />
                <SortHeader label={t("Updated")} field="updated" current={sort} direction={direction} onSort={changeSort} />
                <span aria-hidden="true" />
              </div>
              {listings.slice(0, visibleCount).map((listing) => <MarketRow key={listing.id} listing={listing} />)}
            </div>
          ) : (
            <section className="trade-empty">
              <PackageSearch size={28} aria-hidden="true" />
              <strong>{t("No market listings match these filters")}</strong>
              <span>{t("Try another commodity name, location, system, or availability option.")}</span>
            </section>
          )}

          {visibleCount < listings.length && (
            <div className="load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>{t("Show more listings")}</button></div>
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
        <span data-label={t("Commodity")} role="cell"><strong>{price.commodityName}</strong><small>ID {price.commodityId}</small></span>
        <span data-label={t("Terminal")} role="cell"><strong>{terminal.name}</strong><small>{terminal.location}</small></span>
        <span data-label={t("System")} role="cell"><strong>{terminal.systemName}</strong></span>
        <span data-label={t("Buy price")} role="cell" className="market-price market-price--buy"><strong>{formatPrice(price.buyPrice)}</strong><small>{price.buyPrice > 0 ? t("per SCU") : t("Not sold here")}</small></span>
        <span data-label={t("Sell price")} role="cell" className="market-price market-price--sell"><strong>{formatPrice(price.sellPrice)}</strong><small>{price.sellPrice > 0 ? t("per SCU") : t("Not accepted")}</small></span>
        <span data-label={t("Supply")} role="cell"><strong>{formatAvailability(price.supply)}</strong><small>SCU</small></span>
        <span data-label={t("Demand")} role="cell"><strong>{formatAvailability(price.demand)}</strong><small>SCU</small></span>
        <span data-label={t("Updated")} role="cell"><strong>{formatRelativeTime(price.updatedAt)}</strong><small>{formatDate(price.updatedAt)}</small></span>
        <ChevronDown className="market-row__chevron" size={18} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="market-row__details" role="row">
          <MarketDetail label={t("Market role")} value={formatMarketRole(price)} detail={t("Buy {{v0}} · Sell {{v1}}", { v0: formatPrice(price.buyPrice), v1: formatPrice(price.sellPrice) })} />
          <MarketDetail label={t("Inventory")} value={t("{{v0}} SCU supply", { v0: formatNumber(price.supply) })} detail={t("{{v0}} SCU demand", { v0: formatNumber(price.demand) })} />
          <MarketDetail label={t("Container sizes")} value={formatContainerSizes(price.containerSizes)} detail={terminal.maxContainerSize > 0 ? t("Terminal maximum: {{v0}} SCU", { v0: terminal.maxContainerSize }) : t("Terminal maximum not reported")} />
          <MarketDetail label={t("Cargo services")} value={terminal.supportsAutoload ? t("Autoload available") : t("Manual handling")} detail={formatCargoServices(terminal)} />
          <MarketDetail label={t("Location")} value={terminal.name} detail={`${terminal.location}, ${terminal.systemName}`} />
          <MarketDetail label={t("Report timestamp")} value={formatDate(price.updatedAt)} detail={t("Community-maintained UEX market report")} />
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
  if (price.buyPrice > 0 && price.sellPrice > 0) return t("Buys and sells");
  if (price.buyPrice > 0) return t("Purchase location");
  if (price.sellPrice > 0) return t("Sell location");
  return t("No active market");
}

function formatCargoServices(terminal: TradeTerminal): string {
  const services = [
    terminal.hasFreightElevator ? 'freight elevator' : '',
    terminal.hasLoadingDock ? 'loading dock' : '',
    terminal.hasDockingPort ? 'docking port' : ''
  ].filter(Boolean);
  return services.length > 0 ? services.map(service => t(service)).join(' · ') : t("No cargo services reported");
}

function formatContainerSizes(sizes: number[]): string {
  return sizes.length > 0 ? `${sizes.join(', ')} SCU` : t("Not reported");
}

function formatPrice(value: number): string {
  return value > 0 ? `${value.toLocaleString(locale(), { maximumFractionDigits: 3 })} aUEC` : t("Not available");
}

function formatAvailability(value: number): string {
  return value > 0 ? formatNumber(value) : t("None");
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString(locale());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return t("Unknown date");
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return t("Just now");
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return t("Just now");
  if (minutes < 60) return t("{{v0}}m ago", { v0: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("{{v0}}h ago", { v0: hours });
  return t("{{v0}}d ago", { v0: Math.floor(hours / 24) });
}
