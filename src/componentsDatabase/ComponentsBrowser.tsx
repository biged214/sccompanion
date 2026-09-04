import {
  ArrowRight,
  Box,
  Coins,
  Cpu,
  Crosshair,
  ExternalLink,
  Fan,
  Gauge,
  MapPin,
  Radio,
  RefreshCw,
  Rocket,
  Ruler,
  Search,
  Shield,
  SlidersHorizontal,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { usePersistentState } from '../state/usePersistentState';
import { fetchComponentDetail } from './componentService';
import type { ComponentDetail, ComponentSummary, ComponentsSnapshot } from './types';

type AvailabilityFilter = 'all' | 'purchase' | 'unlisted';
type ComponentSort = 'name' | 'manufacturer' | 'size' | 'price';

export function ComponentsBrowser({ snapshot, isLoading }: { snapshot: ComponentsSnapshot | null; isLoading: boolean }) {
  const components = snapshot?.components ?? [];
  const [search, setSearch] = usePersistentState('components.search', '');
  const [manufacturer, setManufacturer] = usePersistentState('components.manufacturer', 'all');
  const [category, setCategory] = usePersistentState('components.category', 'all');
  const [size, setSize] = usePersistentState('components.size', 'all');
  const [availability, setAvailability] = usePersistentState<AvailabilityFilter>('components.availability', 'all');
  const [sort, setSort] = usePersistentState<ComponentSort>('components.sort', 'name');
  const [visibleCount, setVisibleCount] = usePersistentState('components.visible-count', 24);
  const [selectedComponent, setSelectedComponent] = useState<ComponentSummary | null>(null);
  const filtersMounted = useRef(false);

  const manufacturers = useMemo(
    () => [...new Set(components.map((component) => component.manufacturer))].sort(),
    [components]
  );
  const categories = useMemo(
    () => [...new Set(components.map((component) => component.category))].sort(),
    [components]
  );
  const sizes = useMemo(
    () => [...new Set(components.map((component) => component.size))]
      .sort((left, right) => Number(left) - Number(right) || left.localeCompare(right)),
    [components]
  );
  const filteredComponents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return components
      .filter((component) => !query || `${component.name} ${component.manufacturer} ${component.section} ${component.category}`.toLowerCase().includes(query))
      .filter((component) => manufacturer === 'all' || component.manufacturer === manufacturer)
      .filter((component) => category === 'all' || component.category === category)
      .filter((component) => size === 'all' || component.size === size)
      .filter((component) => {
        if (availability === 'purchase') return component.purchaseLocations.length > 0;
        if (availability === 'unlisted') return component.purchaseLocations.length === 0;
        return true;
      })
      .sort((left, right) => {
        if (sort === 'manufacturer') return left.manufacturer.localeCompare(right.manufacturer) || left.name.localeCompare(right.name);
        if (sort === 'size') return Number(left.size) - Number(right.size) || left.name.localeCompare(right.name);
        if (sort === 'price') return lowestPrice(left) - lowestPrice(right) || left.name.localeCompare(right.name);
        return left.name.localeCompare(right.name);
      });
  }, [availability, category, components, manufacturer, search, size, sort]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setVisibleCount(24);
  }, [availability, category, manufacturer, search, setVisibleCount, size, sort]);

  function clearFilters() {
    setSearch('');
    setManufacturer('all');
    setCategory('all');
    setSize('all');
    setAvailability('all');
    setSort('name');
  }

  return (
    <section className="ships-section components-section">
      <div className="section-heading ships-heading">
        <div>
          <p className="eyebrow">Equipment Database</p>
          <h2>Ship Components</h2>
        </div>
        <p>{filteredComponents.length} of {components.length} components</p>
      </div>

      <section className="ship-filters" aria-label="Component filters">
        <label className="ship-search">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search components" />
        </label>
        <FilterSelect label="Manufacturer" value={manufacturer} onChange={setManufacturer}>
          <option value="all">All manufacturers</option>
          {manufacturers.map((item) => <option key={item} value={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Category" value={category} onChange={setCategory}>
          <option value="all">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Size" value={size} onChange={setSize}>
          <option value="all">All sizes</option>
          {sizes.map((item) => <option key={item} value={item}>Size {item}</option>)}
        </FilterSelect>
        <FilterSelect label="Availability" value={availability} onChange={(value) => setAvailability(value as AvailabilityFilter)}>
          <option value="all">Any availability</option>
          <option value="purchase">Buy in game</option>
          <option value="unlisted">Not sold in game</option>
        </FilterSelect>
        <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as ComponentSort)}>
          <option value="name">Name</option>
          <option value="manufacturer">Manufacturer</option>
          <option value="size">Component size</option>
          <option value="price">Lowest price</option>
        </FilterSelect>
        <button type="button" className="clear-filters" onClick={clearFilters}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Reset
        </button>
      </section>

      <div className="ship-grid component-grid">
        {filteredComponents.slice(0, visibleCount).map((component) => (
          <ComponentCard key={component.id} component={component} onClick={() => setSelectedComponent(component)} />
        ))}
      </div>

      {visibleCount < filteredComponents.length && (
        <div className="load-more">
          <button type="button" onClick={() => setVisibleCount((count) => count + 24)}>
            <ArrowRight size={17} aria-hidden="true" />
            Load more components
          </button>
        </div>
      )}

      {!isLoading && components.length > 0 && filteredComponents.length === 0 && (
        <section className="notice">
          <Cpu size={19} aria-hidden="true" />
          <div><strong>No matching components</strong><span>Adjust or reset the current filters.</span></div>
        </section>
      )}

      {selectedComponent && (
        <ComponentDetailDialog component={selectedComponent} onClose={() => setSelectedComponent(null)} />
      )}
    </section>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="ship-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function ComponentCard({ component, onClick }: { component: ComponentSummary; onClick: () => void }) {
  const purchasePrice = component.purchaseLocations[0]?.price;
  return (
    <button type="button" className="ship-card component-card" onClick={onClick}>
      <ComponentVisual component={component} />
      <span className="ship-card__body">
        <span className="ship-card__badges"><span>{component.section}</span><span>{component.category}</span></span>
        <strong className="ship-card__name">{component.name}</strong>
        <span className="ship-card__maker">{component.manufacturer}</span>
        <span className="ship-card__stats">
          <span><Box size={15} aria-hidden="true" /> Size {component.size}</span>
          <span><MapPin size={15} aria-hidden="true" /> {component.purchaseLocations.length} shops</span>
        </span>
        <span className="ship-card__price">
          {purchasePrice ? `From ${formatCurrency(purchasePrice)} aUEC` : 'Not sold in game'}
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function ComponentVisual({ component, imageUrl }: { component: ComponentSummary; imageUrl?: string | null }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSource(null);
    if (imageUrl) void loadComponentImage(imageUrl).then((url) => { if (active) setSource(url); }).catch(() => undefined);
    return () => { active = false; };
  }, [imageUrl]);

  return (
    <span className={`component-card__visual component-card__visual--${componentTone(component)}`}>
      {source ? <img src={source} alt="" onError={() => setSource(null)} /> : <ComponentIcon category={component.category} size={52} />}
    </span>
  );
}

function ComponentIcon({ category, size }: { category: string; size: number }) {
  const lower = category.toLowerCase();
  if (lower.includes('cooler')) return <Fan size={size} aria-hidden="true" />;
  if (lower.includes('shield')) return <Shield size={size} aria-hidden="true" />;
  if (lower.includes('power')) return <Zap size={size} aria-hidden="true" />;
  if (lower.includes('quantum') || lower.includes('jump')) return <Rocket size={size} aria-hidden="true" />;
  if (lower.includes('radar') || lower.includes('blade')) return <Radio size={size} aria-hidden="true" />;
  if (/gun|missile|turret|bomb|cannon/.test(lower)) return <Crosshair size={size} aria-hidden="true" />;
  if (/mining|salvage|scraper|tractor|fuel|docking/.test(lower)) return <Wrench size={size} aria-hidden="true" />;
  return <Cpu size={size} aria-hidden="true" />;
}

function ComponentDetailDialog({ component, onClose }: { component: ComponentSummary; onClose: () => void }) {
  const [detail, setDetail] = useState<ComponentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    void fetchComponentDetail(component)
      .then((result) => { if (active) setDetail(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load component details.'); });
    return () => { active = false; };
  }, [component]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="ship-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ship-dialog component-dialog" role="dialog" aria-modal="true" aria-labelledby="component-dialog-title">
        <header className="ship-dialog__header">
          <div><p className="eyebrow">{component.manufacturer}</p><h2 id="component-dialog-title">{component.name}</h2></div>
          <button type="button" className="icon-button" aria-label="Close component details" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </header>

        <div className="ship-dialog__hero">
          <ComponentVisual component={component} imageUrl={detail?.imageUrl} />
          <div>
            <div className="ship-detail-badges"><span>{component.section}</span><span>{detail?.type || component.category}</span><span>Size {detail?.size || component.size}</span></div>
            {detail?.description && <p>{detail.description}</p>}
            {!detail && !error && <div className="inline-loading"><RefreshCw size={18} className="spin" aria-hidden="true" /> Loading specifications...</div>}
            {error && <p className="inline-error">{error} Basic UEX information is still shown below.</p>}
          </div>
        </div>

        <div className="ship-dialog__content">
          <DetailSection title="Component information">
            <div className="ship-spec-grid">
              <Spec icon={<Box size={18} />} label="Size" value={`S${detail?.size || component.size}`} />
              <Spec icon={<Gauge size={18} />} label="Grade" value={detail?.grade || 'Loading'} />
              <Spec icon={<Cpu size={18} />} label="Class" value={detail?.itemClass || 'Loading'} />
              <Spec icon={<Ruler size={18} />} label="Mass" value={detail ? `${formatNumber(detail.mass)} kg` : 'Loading'} />
              <Spec icon={<Shield size={18} />} label="Health" value={detail ? `${formatNumber(detail.health)} HP` : 'Loading'} />
              <Spec icon={<Wrench size={18} />} label="Repairable" value={detail?.repairable == null ? 'Unknown' : detail.repairable ? 'Yes' : 'No'} />
            </div>
          </DetailSection>

          {detail && detail.specifications.length > 0 && (
            <DetailSection title="Performance">
              <div className="ship-spec-grid">
                {detail.specifications.map((spec) => <Spec key={spec.label} icon={<Gauge size={18} />} label={spec.label} value={spec.value} />)}
              </div>
            </DetailSection>
          )}

          <PriceSection entries={component.purchaseLocations} />

          <footer className="ship-dialog__footer">
            <span>UEX market data · Wiki specs {detail?.version || component.gameVersion}</span>
            <div>{detail?.wikiUrl && <ExternalButton href={detail.wikiUrl}>Open Wiki</ExternalButton>}</div>
          </footer>
        </div>
      </section>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ship-detail-section"><h3>{title}</h3>{children}</section>;
}

function Spec({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="ship-spec"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function PriceSection({ entries }: { entries: ComponentSummary['purchaseLocations'] }) {
  return (
    <DetailSection title="Buy in game">
      {entries.length ? (
        <div className="ship-price-table-wrap">
          <table className="ship-price-table">
            <thead><tr><th>Dealer</th><th>Location</th><th>Price</th></tr></thead>
            <tbody>{entries.map((entry) => (
              <tr key={`${entry.terminal}-${entry.location}-${entry.price}`}>
                <td>{entry.terminal}</td><td>{entry.location}</td><td>{formatCurrency(entry.price)} aUEC</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="ship-empty-price">This component is not currently listed for in-game purchase.</p>}
    </DetailSection>
  );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, href)}>{children}<ExternalLink size={15} aria-hidden="true" /></a>;
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!window.__TAURI_INTERNALS__) return;
  event.preventDefault();
  void openExternalUrl(url);
}

function componentTone(component: ComponentSummary): string {
  if (component.section === 'Vehicle Weapons') return 'weapons';
  if (component.section === 'Systems') return 'systems';
  if (component.section === 'Avionics') return 'avionics';
  if (component.section === 'Propulsion') return 'propulsion';
  return 'utility';
}

function lowestPrice(component: ComponentSummary): number {
  return component.purchaseLocations[0]?.price ?? Number.POSITIVE_INFINITY;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

const componentImageCache = new Map<string, Promise<string>>();

async function loadComponentImage(url: string): Promise<string> {
  const cached = componentImageCache.get(url);
  if (cached) return cached;
  const request = fetchComponentImage(url);
  componentImageCache.set(url, request);
  request.catch(() => componentImageCache.delete(url));
  return request;
}

async function fetchComponentImage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const parsedUrl = new URL(url);
    const browserUrl = parsedUrl.hostname === 'cstone.space'
      ? `/api/cstone${parsedUrl.pathname}${parsedUrl.search}`
      : parsedUrl.hostname === 'media.starcitizen.tools'
        ? `/api/sc-tools-media${parsedUrl.pathname}${parsedUrl.search}`
        : url;
    const response = window.__TAURI_INTERNALS__
      ? await (await import('@tauri-apps/plugin-http')).fetch(url, { method: 'GET', signal: controller.signal })
      : await window.fetch(browserUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Component image returned ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
    return `data:${contentType};base64,${bytesToBase64(bytes)}`;
  } finally {
    window.clearTimeout(timeout);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}
