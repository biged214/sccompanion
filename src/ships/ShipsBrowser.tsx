import {
  ArrowRight,
  Box,
  Cog,
  Coins,
  Crosshair,
  ExternalLink,
  Gauge,
  HeartPulse,
  MapPin,
  Radar,
  RefreshCw,
  Rocket,
  Ruler,
  Search,
  Shield,
  Ship as ShipIcon,
  SlidersHorizontal,
  Users,
  X,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { usePersistentState } from '../state/usePersistentState';
import { fetchShipDetail } from './shipService';
import type { ShipDetail, ShipEquipmentItem, ShipSummary, ShipsSnapshot, ShipTurret } from './types';

type AvailabilityFilter = 'all' | 'purchase' | 'rental' | 'flight-ready' | 'concept';
type ShipSort = 'name' | 'manufacturer' | 'cargo' | 'price' | 'crew';

export function ShipsBrowser({ snapshot, isLoading }: { snapshot: ShipsSnapshot | null; isLoading: boolean }) {
  const ships = snapshot?.ships ?? [];
  const [search, setSearch] = usePersistentState('ships.search', '');
  const [manufacturer, setManufacturer] = usePersistentState('ships.manufacturer', 'all');
  const [role, setRole] = usePersistentState('ships.role', 'all');
  const [kind, setKind] = usePersistentState('ships.kind', 'all');
  const [availability, setAvailability] = usePersistentState<AvailabilityFilter>('ships.availability', 'all');
  const [sort, setSort] = usePersistentState<ShipSort>('ships.sort', 'name');
  const [visibleCount, setVisibleCount] = usePersistentState('ships.visible-count', 24);
  const [selectedShip, setSelectedShip] = useState<ShipSummary | null>(null);
  const filtersMounted = useRef(false);

  const manufacturers = useMemo(
    () => [...new Set(ships.map((ship) => ship.manufacturer))].sort(),
    [ships]
  );
  const roles = useMemo(
    () => [...new Set(ships.flatMap((ship) => ship.roles))].sort(),
    [ships]
  );
  const filteredShips = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ships
      .filter((ship) => !query || `${ship.name} ${ship.fullName} ${ship.manufacturer} ${ship.roles.join(' ')}`.toLowerCase().includes(query))
      .filter((ship) => manufacturer === 'all' || ship.manufacturer === manufacturer)
      .filter((ship) => role === 'all' || ship.roles.includes(role))
      .filter((ship) => kind === 'all' || ship.kind === kind)
      .filter((ship) => {
        if (availability === 'purchase') return ship.purchaseLocations.length > 0;
        if (availability === 'rental') return ship.rentalLocations.length > 0;
        if (availability === 'concept') return ship.isConcept;
        if (availability === 'flight-ready') return !ship.isConcept;
        return true;
      })
      .sort((left, right) => {
        if (sort === 'manufacturer') return left.manufacturer.localeCompare(right.manufacturer) || left.name.localeCompare(right.name);
        if (sort === 'cargo') return right.cargoCapacity - left.cargoCapacity || left.name.localeCompare(right.name);
        if (sort === 'crew') return right.crewMax - left.crewMax || left.name.localeCompare(right.name);
        if (sort === 'price') return lowestPrice(left) - lowestPrice(right) || left.name.localeCompare(right.name);
        return left.name.localeCompare(right.name);
      });
  }, [availability, kind, manufacturer, role, search, ships, sort]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setVisibleCount(24);
  }, [availability, kind, manufacturer, role, search, setVisibleCount, sort]);

  function clearFilters() {
    setSearch('');
    setManufacturer('all');
    setRole('all');
    setKind('all');
    setAvailability('all');
    setSort('name');
  }

  return (
    <section className="ships-section">
      <div className="section-heading ships-heading">
        <div>
          <p className="eyebrow">Vehicle Database</p>
          <h2>Ships</h2>
        </div>
        <p>{filteredShips.length} of {ships.length} vehicles</p>
      </div>

      <section className="ship-filters" aria-label="Ship filters">
        <label className="ship-search">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ships" />
        </label>
        <FilterSelect label="Manufacturer" value={manufacturer} onChange={setManufacturer}>
          <option value="all">All manufacturers</option>
          {manufacturers.map((item) => <option key={item} value={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Role" value={role} onChange={setRole}>
          <option value="all">All roles</option>
          {roles.map((item) => <option key={item} value={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Type" value={kind} onChange={setKind}>
          <option value="all">Ships and ground</option>
          <option value="Ship">Ships</option>
          <option value="Ground Vehicle">Ground vehicles</option>
        </FilterSelect>
        <FilterSelect label="Availability" value={availability} onChange={(value) => setAvailability(value as AvailabilityFilter)}>
          <option value="all">Any availability</option>
          <option value="purchase">Buy in game</option>
          <option value="rental">Rent in game</option>
          <option value="flight-ready">Flight ready</option>
          <option value="concept">Concept</option>
        </FilterSelect>
        <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as ShipSort)}>
          <option value="name">Name</option>
          <option value="manufacturer">Manufacturer</option>
          <option value="cargo">Cargo capacity</option>
          <option value="price">Lowest price</option>
          <option value="crew">Maximum crew</option>
        </FilterSelect>
        <button type="button" className="clear-filters" onClick={clearFilters}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Reset
        </button>
      </section>

      <div className="ship-grid">
        {filteredShips.slice(0, visibleCount).map((ship) => (
          <ShipCard key={ship.id} ship={ship} onClick={() => setSelectedShip(ship)} />
        ))}
      </div>

      {visibleCount < filteredShips.length && (
        <div className="load-more">
          <button type="button" onClick={() => setVisibleCount((count) => count + 24)}>
            <ArrowRight size={17} aria-hidden="true" />
            Load more ships
          </button>
        </div>
      )}

      {!isLoading && ships.length > 0 && filteredShips.length === 0 && (
        <section className="notice">
          <ShipIcon size={19} aria-hidden="true" />
          <div>
            <strong>No matching ships</strong>
            <span>Adjust or reset the current filters.</span>
          </div>
        </section>
      )}

      {selectedShip && <ShipDetailDialog ship={selectedShip} onClose={() => setSelectedShip(null)} />}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="ship-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function ShipCard({ ship, onClick }: { ship: ShipSummary; onClick: () => void }) {
  const purchasePrice = ship.purchaseLocations[0]?.price;
  return (
    <button type="button" className="ship-card" onClick={onClick}>
      <ShipImage ship={ship} />
      <span className="ship-card__body">
        <span className="ship-card__badges">
          <span>{ship.kind}</span>
          <span className={ship.isConcept ? 'ship-badge ship-badge--concept' : 'ship-badge ship-badge--ready'}>
            {ship.isConcept ? 'Concept' : 'Flight Ready'}
          </span>
        </span>
        <strong className="ship-card__name">{ship.name}</strong>
        <span className="ship-card__maker">{ship.manufacturer}</span>
        <span className="ship-card__stats">
          <span><Users size={15} aria-hidden="true" /> {formatCrew(ship)}</span>
          <span><Box size={15} aria-hidden="true" /> {formatNumber(ship.cargoCapacity)} SCU</span>
          <span><Ruler size={15} aria-hidden="true" /> {formatNumber(ship.length)} m</span>
        </span>
        <span className="ship-card__price">
          {purchasePrice ? `From ${formatCurrency(purchasePrice)} aUEC` : ship.rentalLocations.length ? `Rent from ${formatCurrency(ship.rentalLocations[0].price)} aUEC` : 'Not sold in game'}
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

function ShipImage({ ship }: { ship: ShipSummary }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidates = [ship.imageUrl, ship.fallbackImageUrl].filter((url): url is string => Boolean(url));

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [ship.imageUrl, ship.fallbackImageUrl]);

  useEffect(() => {
    let active = true;
    setSource(null);

    const candidate = candidates[candidateIndex];
    if (!candidate) {
      setFailed(true);
      return;
    }

    void loadCuratedImage(candidate)
      .then((url) => {
        if (active) setSource(url);
      })
      .catch(() => {
        if (active) handleImageFailure();
      });

    function handleImageFailure() {
      if (candidateIndex + 1 < candidates.length) setCandidateIndex((value) => value + 1);
      else setFailed(true);
    }

    return () => {
      active = false;
    };
  }, [candidateIndex, ship.imageUrl, ship.fallbackImageUrl]);

  return (
    <span className="ship-card__image">
      {!failed && source ? (
        <img
          src={source}
          alt=""
          onError={() => candidateIndex + 1 < candidates.length
            ? setCandidateIndex((value) => value + 1)
            : setFailed(true)}
        />
      ) : (
        <ShipIcon size={42} aria-hidden="true" />
      )}
    </span>
  );
}

async function loadCuratedImage(url: string): Promise<string> {
  if (url.startsWith('/')) return url;

  const existing = shipImageCache.get(url);
  if (existing) return existing;

  const request = enqueueShipImage(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    try {
      const response = window.__TAURI_INTERNALS__
        ? await (await import('@tauri-apps/plugin-http')).fetch(url, { method: 'GET', signal: controller.signal })
        : await window.fetch(`/api/uex-assets${new URL(url).pathname}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Ship image returned ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${type};base64,${bytesToBase64(bytes)}`;
    } finally {
      window.clearTimeout(timeout);
    }
  });
  shipImageCache.set(url, request);
  request.catch(() => shipImageCache.delete(url));
  return request;
}

const shipImageCache = new Map<string, Promise<string>>();
const shipImageQueue: Array<() => void> = [];
const maxConcurrentShipImages = 4;
let activeShipImages = 0;

function enqueueShipImage<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    shipImageQueue.push(() => {
      activeShipImages += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          activeShipImages -= 1;
          window.setTimeout(runNextShipImages, 40);
        });
    });
    runNextShipImages();
  });
}

function runNextShipImages() {
  while (activeShipImages < maxConcurrentShipImages && shipImageQueue.length) {
    shipImageQueue.shift()?.();
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
}

function ShipDetailDialog({ ship, onClose }: { ship: ShipSummary; onClose: () => void }) {
  const [detail, setDetail] = useState<ShipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'weapons' | 'systems' | 'propulsion' | 'availability'>('overview');

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    setActiveTab('overview');
    void fetchShipDetail(ship)
      .then((result) => { if (active) setDetail(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load ship details.'); });
    return () => { active = false; };
  }, [ship]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="ship-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ship-dialog" role="dialog" aria-modal="true" aria-labelledby="ship-dialog-title">
        <header className="ship-dialog__header">
          <div>
            <p className="eyebrow">{ship.manufacturer}</p>
            <h2 id="ship-dialog-title">{ship.name}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close ship details" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="ship-dialog__hero">
          <ShipImage ship={ship} />
          <div>
            <div className="ship-detail-badges">
              <span>{ship.kind}</span>
              <span>{detail?.career || ship.roles[0] || 'General'}</span>
              <span>{detail?.role || ship.roles.slice(0, 2).join(' / ') || 'Multi-role'}</span>
            </div>
            {detail?.description && <p>{detail.description}</p>}
            {!detail && !error && <div className="inline-loading"><RefreshCw size={18} className="spin" aria-hidden="true" /> Loading specifications...</div>}
            {error && <p className="inline-error">{error} Basic UEX information is still shown below.</p>}
          </div>
        </div>

        <div className="ship-dialog__content">
          <nav className="ship-detail-tabs" aria-label="Ship detail sections">
            <DetailTab label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <DetailTab label="Weapons" active={activeTab === 'weapons'} onClick={() => setActiveTab('weapons')} />
            <DetailTab label="Systems" active={activeTab === 'systems'} onClick={() => setActiveTab('systems')} />
            <DetailTab label="Propulsion" active={activeTab === 'propulsion'} onClick={() => setActiveTab('propulsion')} />
            <DetailTab label="Availability" active={activeTab === 'availability'} onClick={() => setActiveTab('availability')} />
          </nav>

          {activeTab === 'overview' && (
            <>
              <DetailSection title="Core specifications">
                <div className="ship-spec-grid">
                  <Spec icon={<Users size={18} />} label="Crew" value={detail ? formatCrewRange(detail.crewMin, detail.crewMax) : formatCrew(ship)} />
                  <Spec icon={<Box size={18} />} label="Cargo" value={`${formatNumber(detail?.cargoCapacity ?? ship.cargoCapacity)} SCU`} />
                  <Spec icon={<Ruler size={18} />} label="Dimensions" value={`${formatNumber(detail?.length ?? ship.length)} x ${formatNumber(detail?.width ?? ship.width)} x ${formatNumber(detail?.height ?? ship.height)} m`} />
                  <Spec icon={<ShipIcon size={18} />} label="Mass" value={formatMetric(detail?.mass ?? ship.mass, 'kg', true)} />
                  <Spec icon={<Gauge size={18} />} label="SCM / NAV" value={detail ? `${formatNumber(detail.scmSpeed)} / ${formatNumber(detail.maxSpeed)} m/s` : 'Loading'} />
                  <Spec icon={<MapPin size={18} />} label="Pad size" value={ship.padType || 'Not listed'} />
                </div>
              </DetailSection>

              {detail && <DetailSection title="Capacity and durability">
                <div className="ship-spec-grid">
                  <Spec icon={<HeartPulse size={18} />} label="Hull health" value={formatMetric(detail.health, 'HP', true)} />
                  <Spec icon={<Shield size={18} />} label="Armor health" value={formatMetric(detail.armorHealth, 'HP', true)} />
                  <Spec icon={<Box size={18} />} label="Cargo grids" value={formatMetric(detail.cargoGridCount)} />
                  <Spec icon={<Box size={18} />} label="Largest cargo box" value={formatMetric(detail.maxCargoBoxSize, 'SCU')} />
                  <Spec icon={<Box size={18} />} label="Inventory" value={formatMetric(detail.inventoryCapacity, 'SCU')} />
                  <Spec icon={<HeartPulse size={18} />} label="Beds / medical" value={`${detail.bedCount || 'Not listed'} / ${detail.medicalTier || 'None'}`} />
                </div>
              </DetailSection>}
            </>
          )}

          {activeTab === 'weapons' && detail && (
            <>
              <DetailSection title="Combat output">
                <div className="ship-spec-grid">
                  <Spec icon={<Crosshair size={18} />} label="Pilot DPS" value={formatMetric(detail.pilotDps)} />
                  <Spec icon={<Crosshair size={18} />} label="Turret DPS" value={formatMetric(detail.turretDps)} />
                  <Spec icon={<Rocket size={18} />} label="Missiles" value={formatMetric(detail.missileCount)} />
                  <Spec icon={<Shield size={18} />} label="Countermeasures" value={formatMetric(detail.countermeasureCount)} />
                </div>
              </DetailSection>
              <EquipmentSection title="Equipped weapons" items={detail.weapons} emptyText="No equipped gun details are listed for this vehicle." showControl />
              <TurretSection turrets={detail.turrets} />
              <EquipmentSection title="Missiles and racks" items={detail.missiles} emptyText="No equipped missile details are listed for this vehicle." showControl />
            </>
          )}

          {activeTab === 'systems' && detail && (
            <>
              <DetailSection title="Defense, power, and signatures">
                <div className="ship-spec-grid">
                  <Spec icon={<Shield size={18} />} label="Shield capacity" value={formatMetric(detail.shieldHp, 'HP', true)} />
                  <Spec icon={<Shield size={18} />} label="Shield regeneration" value={formatMetric(detail.shieldRegeneration, 'HP/s', true)} />
                  <Spec icon={<Shield size={18} />} label="Shield faces" value={detail.shieldFaceType || 'Not listed'} />
                  <Spec icon={<Zap size={18} />} label="Power segments" value={formatMetric(detail.powerSegments)} />
                  <Spec icon={<Cog size={18} />} label="Cooling segments" value={formatMetric(detail.coolingSegments)} />
                  <Spec icon={<Radar size={18} />} label="IR / EM signature" value={`${formatNumber(detail.infraredSignature)} / ${formatNumber(detail.electromagneticSignature)}`} />
                </div>
              </DetailSection>
              <EquipmentSection
                title="Installed systems and avionics"
                items={detail.components.filter((item) => !isPropulsionComponent(item) && !isWeaponComponent(item))}
                emptyText="No installed system details are listed for this vehicle."
              />
            </>
          )}

          {activeTab === 'propulsion' && detail && (
            <>
              <DetailSection title="Flight and quantum performance">
                <div className="ship-spec-grid">
                  <Spec icon={<Gauge size={18} />} label="Forward / reverse boost" value={`${formatNumber(detail.boostForwardSpeed)} / ${formatNumber(detail.boostBackwardSpeed)} m/s`} />
                  <Spec icon={<Gauge size={18} />} label="Pitch / yaw / roll" value={`${formatNumber(detail.pitchRate)} / ${formatNumber(detail.yawRate)} / ${formatNumber(detail.rollRate)} deg/s`} />
                  <Spec icon={<Rocket size={18} />} label="Quantum speed" value={formatMetric(detail.quantumSpeed, 'm/s', true)} />
                  <Spec icon={<Rocket size={18} />} label="Quantum spool" value={formatMetric(detail.quantumSpoolTime, 'sec')} />
                  <Spec icon={<Rocket size={18} />} label="Quantum range" value={formatMetric(detail.quantumRange, 'm', true)} />
                  <Spec icon={<Zap size={18} />} label="Quantum fuel" value={formatMetric(detail.quantumFuelCapacity, 'SCU')} />
                  <Spec icon={<Zap size={18} />} label="Hydrogen fuel" value={formatMetric(detail.fuelCapacity, 'SCU')} />
                  <Spec icon={<Zap size={18} />} label="Fuel intake" value={formatMetric(detail.fuelIntakeRate, '/s', true)} />
                </div>
              </DetailSection>
              <ThrusterSection detail={detail} />
              <EquipmentSection
                title="Installed propulsion systems"
                items={detail.components.filter(isPropulsionComponent)}
                emptyText="No installed propulsion component details are listed for this vehicle."
              />
            </>
          )}

          {activeTab === 'availability' && (
            <>
              <PriceSection title="Buy in game" entries={ship.purchaseLocations} emptyText="This vehicle is not currently listed for in-game purchase." />
              <PriceSection title="Rent in game" entries={ship.rentalLocations} emptyText="This vehicle is not currently listed for rental." rental />
            </>
          )}

          {!detail && activeTab !== 'overview' && (
            <p className="ship-tab-loading">{error ? 'Detailed specifications are unavailable for this vehicle.' : 'Loading detailed specifications...'}</p>
          )}

          <footer className="ship-dialog__footer">
            <span>UEX market data · Wiki specs {detail?.version || ship.gameVersion}</span>
            <div>
              {detail?.wikiUrl && <ExternalButton href={detail.wikiUrl}>Open Wiki</ExternalButton>}
              {(detail?.pledgeUrl || ship.pledgeUrl) && <ExternalButton href={detail?.pledgeUrl || ship.pledgeUrl || ''}>RSI Pledge Store</ExternalButton>}
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

function DetailTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}>{label}</button>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ship-detail-section"><h3>{title}</h3>{children}</section>;
}

function Spec({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="ship-spec"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function EquipmentSection({
  title,
  items,
  emptyText,
  showControl = false
}: {
  title: string;
  items: ShipEquipmentItem[];
  emptyText: string;
  showControl?: boolean;
}) {
  return (
    <DetailSection title={title}>
      {items.length ? <div className="ship-price-table-wrap"><table className="ship-price-table ship-equipment-table">
        <thead><tr><th>Component</th><th>Type</th>{showControl && <th>Control</th>}<th>Size</th><th>Qty</th><th>Details</th></tr></thead>
        <tbody>{items.map((item) => <tr key={`${item.type}-${item.name}-${item.size}-${item.control ?? ''}`}>
          <td><strong>{item.name}</strong>{item.manufacturer && <small>{item.manufacturer}</small>}</td>
          <td>{item.type}</td>
          {showControl && <td><span className="ship-control-badge">{item.control || 'Not listed'}</span></td>}
          <td>{item.size ? `S${item.size}` : 'N/A'}</td>
          <td>{item.quantity}</td>
          <td>{item.details.length ? item.details.map((entry) => `${entry.label}: ${entry.value}`).join(' · ') : 'Standard loadout'}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ship-empty-price">{emptyText}</p>}
    </DetailSection>
  );
}

function TurretSection({ turrets }: { turrets: ShipTurret[] }) {
  return (
    <DetailSection title="Turrets">
      {turrets.length ? <div className="ship-price-table-wrap"><table className="ship-price-table ship-equipment-table">
        <thead><tr><th>Turret</th><th>Control</th><th>Mounts</th><th>Weapons</th><th>DPS</th></tr></thead>
        <tbody>{turrets.map((turret, index) => <tr key={`${turret.control}-${turret.name}-${index}`}>
          <td><strong>{turret.name}</strong><small>{turret.size ? `Size ${turret.size}` : 'Size not listed'}</small></td>
          <td>{turret.control}{turret.pilotSlaveable ? ' · Pilot slaveable' : ''}</td>
          <td>{turret.mountCount || turret.weaponSizes.length || 'N/A'}{turret.weaponSizes.length ? ` · ${turret.weaponSizes.map((size) => `S${size}`).join(', ')}` : ''}</td>
          <td>{turret.weapons.join(', ') || 'Not equipped'}</td>
          <td>{formatMetric(turret.dps)}{turret.sustainedDps ? ` · ${formatNumber(turret.sustainedDps)} sustained` : ''}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ship-empty-price">No manned, remote, or point-defense turret details are listed for this vehicle.</p>}
    </DetailSection>
  );
}

function ThrusterSection({ detail }: { detail: ShipDetail }) {
  return (
    <DetailSection title="Thrusters">
      {detail.thrusters.length ? <div className="ship-price-table-wrap"><table className="ship-price-table">
        <thead><tr><th>Group</th><th>Count</th><th>Capacity</th><th>Acceleration</th></tr></thead>
        <tbody>{detail.thrusters.map((thruster) => <tr key={thruster.type}>
          <td>{thruster.type}</td><td>{thruster.count}</td><td>{formatMetric(thruster.capacityMn, 'MN')}</td><td>{formatMetric(thruster.accelerationG, 'g')}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ship-empty-price">No thruster group details are listed for this vehicle.</p>}
    </DetailSection>
  );
}

function isPropulsionComponent(item: ShipEquipmentItem): boolean {
  return /fuel|quantum|jump|propulsion/i.test(item.type);
}

function isWeaponComponent(item: ShipEquipmentItem): boolean {
  return /weapon|turret|missile/i.test(item.type);
}

function PriceSection({ title, entries, emptyText, rental = false }: { title: string; entries: ShipSummary['purchaseLocations']; emptyText: string; rental?: boolean }) {
  return (
    <DetailSection title={title}>
      {entries.length ? (
        <div className="ship-price-table-wrap">
          <table className="ship-price-table">
            <thead><tr><th>Dealer</th><th>Location</th><th>{rental ? 'Daily rental' : 'Price'}</th></tr></thead>
            <tbody>{entries.map((entry) => (
              <tr key={`${entry.terminal}-${entry.location}-${entry.price}`}>
                <td>{entry.terminal}</td><td>{entry.location}</td><td>{formatCurrency(entry.price)} aUEC</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="ship-empty-price">{emptyText}</p>}
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

function lowestPrice(ship: ShipSummary): number {
  return ship.purchaseLocations[0]?.price ?? Number.POSITIVE_INFINITY;
}

function formatCrew(ship: ShipSummary): string {
  return formatCrewRange(ship.crewMin, ship.crewMax);
}

function formatCrewRange(min: number, max: number): string {
  if (!max) return 'Unknown';
  return min && min !== max ? `${min}-${max}` : String(max);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

function formatMetric(value: number, unit = '', whole = false): string {
  if (!value) return 'Not listed';
  const formatted = whole ? formatCurrency(value) : formatNumber(value);
  return unit ? `${formatted} ${unit}` : formatted;
}
