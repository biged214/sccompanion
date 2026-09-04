import { Anchor, ChevronDown, PackageOpen, RefreshCw, Route as RouteIcon, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShipSummary } from '../ships/types';
import { hasPersistentState, usePersistentState } from '../state/usePersistentState';
import { calculateRoutes } from './calculateRoutes';
import { fetchTerminalDistance } from './tradeRouteService';
import { getShipCargoProfile, terminalSupportsCargoMode } from './shipCompatibility';
import type { RouteSort, TradeMarketSnapshot, TradeRoute } from './types';

const PAGE_SIZE = 40;
const UEX_ESTIMATED_SECONDS_PER_GM = 8.625;

export function TradeRoutePlanner({
  snapshot,
  marketLoading,
  marketError,
  usingCache,
  onRefresh,
  ships,
  shipsLoading
}: {
  snapshot: TradeMarketSnapshot | null;
  marketLoading: boolean;
  marketError: string | null;
  usingCache: boolean;
  onRefresh: () => Promise<void>;
  ships: ShipSummary[];
  shipsLoading: boolean;
}) {
  const cargoShips = useMemo(
    () => ships.filter((ship) => ship.kind === 'Ship' && ship.cargoCapacity > 0 && !ship.isConcept).sort((a, b) => a.name.localeCompare(b.name)),
    [ships]
  );
  const [shipId, setShipId] = usePersistentState('trade-routes.ship', '');
  const [funds, setFunds] = usePersistentState('trade-routes.funds', '');
  const [originSystem, setOriginSystem] = usePersistentState('trade-routes.origin-system', '');
  const [destinationSystem, setDestinationSystem] = usePersistentState('trade-routes.destination-system', '');
  const [originTerminal, setOriginTerminal] = usePersistentState('trade-routes.origin-terminal', '');
  const [destinationTerminal, setDestinationTerminal] = usePersistentState('trade-routes.destination-terminal', '');
  const [autoloadOnly, setAutoloadOnly] = usePersistentState('trade-routes.autoload-only', false);
  const [sort, setSort] = usePersistentState<RouteSort>('trade-routes.sort', 'profit');
  const [visibleCount, setVisibleCount] = usePersistentState('trade-routes.visible-count', PAGE_SIZE);
  const systemsInitialized = useRef(
    hasPersistentState('trade-routes.origin-system') || hasPersistentState('trade-routes.destination-system')
  );
  const filtersMounted = useRef(false);

  useEffect(() => {
    if (cargoShips.length > 0 && !cargoShips.some((ship) => String(ship.id) === shipId)) {
      const defaultShip = cargoShips.find((ship) => ship.name.toLowerCase().includes('freelancer max')) ?? cargoShips[0];
      setShipId(String(defaultShip.id));
    }
  }, [cargoShips, shipId]);

  useEffect(() => {
    if (!snapshot || systemsInitialized.current) return;
    systemsInitialized.current = true;
    const stanton = snapshot.systems.find((system) => system.name === 'Stanton');
    if (stanton) {
      setOriginSystem(String(stanton.id));
      setDestinationSystem(String(stanton.id));
    }
  }, [snapshot]);

  const ship = cargoShips.find((candidate) => String(candidate.id) === shipId);
  const cargoProfile = getShipCargoProfile(ship);
  const originTerminals = filterTerminals(snapshot, originSystem, autoloadOnly, cargoProfile.mode);
  const destinationTerminals = filterTerminals(snapshot, destinationSystem, autoloadOnly, cargoProfile.mode);
  const routes = useMemo(() => snapshot && ship ? calculateRoutes(snapshot, {
    cargoCapacity: ship.cargoCapacity,
    funds: parseOptionalNumber(funds),
    originSystemId: parseOptionalNumber(originSystem),
    destinationSystemId: parseOptionalNumber(destinationSystem),
    originTerminalId: parseOptionalNumber(originTerminal),
    destinationTerminalId: parseOptionalNumber(destinationTerminal),
    autoloadOnly,
    cargoAccessMode: cargoProfile.mode
  }, sort) : [], [autoloadOnly, cargoProfile.mode, destinationSystem, destinationTerminal, funds, originSystem, originTerminal, ship, snapshot, sort]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setVisibleCount(PAGE_SIZE);
  }, [autoloadOnly, destinationSystem, destinationTerminal, funds, originSystem, originTerminal, setVisibleCount, shipId, sort]);

  function changeOriginSystem(value: string) {
    setOriginSystem(value);
    setOriginTerminal('');
  }

  function changeDestinationSystem(value: string) {
    setDestinationSystem(value);
    setDestinationTerminal('');
  }

  return (
    <section className="trade-planner">
      <div className="section-heading trade-planner__heading">
        <div>
          <p className="eyebrow">Commodity Planner</p>
          <h2>Trade Routes</h2>
        </div>
        <p>Compare current market routes against your ship capacity and available funds.</p>
      </div>

      <section className="trade-filters" aria-label="Trade route filters">
        <div className="trade-filter-heading">
          <SlidersHorizontal size={18} aria-hidden="true" />
          <strong>Route criteria</strong>
          <span>{ship ? `${formatNumber(ship.cargoCapacity)} SCU · ${cargoProfile.label}` : 'Select a cargo ship'}</span>
        </div>
        <div className="trade-filter-grid">
          <label>
            <span>Ship</span>
            <select value={shipId} onChange={(event) => setShipId(event.target.value)} disabled={shipsLoading && cargoShips.length === 0}>
              <option value="">Select a ship</option>
              {cargoShips.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} - {formatNumber(candidate.cargoCapacity)} SCU</option>)}
            </select>
          </label>
          <label>
            <span>Available funds (aUEC)</span>
            <input type="number" min="0" step="1000" value={funds} placeholder="No limit" onChange={(event) => setFunds(event.target.value)} />
          </label>
          <label>
            <span>Origin system</span>
            <select value={originSystem} onChange={(event) => changeOriginSystem(event.target.value)}>
              <option value="">All live systems</option>
              {snapshot?.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
            </select>
          </label>
          <label>
            <span>Starting point</span>
            <select value={originTerminal} onChange={(event) => setOriginTerminal(event.target.value)}>
              <option value="">Any origin</option>
              {originTerminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
            </select>
          </label>
          <label>
            <span>Destination system</span>
            <select value={destinationSystem} onChange={(event) => changeDestinationSystem(event.target.value)}>
              <option value="">All live systems</option>
              {snapshot?.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
            </select>
          </label>
          <label>
            <span>Ending point</span>
            <select value={destinationTerminal} onChange={(event) => setDestinationTerminal(event.target.value)}>
              <option value="">Any destination</option>
              {destinationTerminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name}</option>)}
            </select>
          </label>
        </div>
        <div className="trade-filter-options">
          <label className="trade-toggle">
            <input type="checkbox" checked={autoloadOnly} onChange={(event) => setAutoloadOnly(event.target.checked)} />
            <span aria-hidden="true" />
            Use automated loading and unloading
          </label>
          <label className="trade-sort">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as RouteSort)}>
              <option value="profit">Total profit</option>
              <option value="roi">Return on investment</option>
              <option value="unit-profit">Profit per SCU</option>
              <option value="cargo">Cargo moved</option>
            </select>
          </label>
        </div>
        {cargoProfile.mode === 'external-dock' && (
          <div className="trade-compatibility" role="status">
            <Anchor size={19} aria-hidden="true" />
            <div>
              <strong>{ship?.name}: {cargoProfile.label}</strong>
              <span>{cargoProfile.description} Surface, pad-only, and ordinary hangar terminals are excluded automatically.</span>
            </div>
          </div>
        )}
      </section>

      {marketError && (
        <section className="notice notice--error" role="alert">
          <RefreshCw size={19} aria-hidden="true" />
          <div><strong>Market refresh failed</strong><span>{marketError}</span>{usingCache && <span>Showing saved market data.</span>}</div>
        </section>
      )}
      {marketLoading && !snapshot && (
        <section className="notice"><RefreshCw size={19} className="spin" aria-hidden="true" /><div><strong>Loading commodity markets</strong><span>Fetching live systems, terminals, prices, supply, and demand.</span></div></section>
      )}

      {snapshot && (
        <section className="trade-results">
          <div className="trade-results__summary">
            <div><RouteIcon size={18} aria-hidden="true" /><strong>{formatNumber(routes.length)} viable routes</strong><span>Verified shared box sizes · ranked using current UEX market reports</span></div>
            <button type="button" className="refresh-button" onClick={() => void onRefresh()} disabled={marketLoading}>
              <RefreshCw size={16} className={marketLoading ? 'spin' : undefined} aria-hidden="true" /> Refresh markets
            </button>
          </div>
          {routes.length > 0 ? (
            <div className="trade-route-list">
              <div className="trade-route-head" aria-hidden="true">
                <span>Commodity and route</span><span>Est. time</span><span>Cargo</span><span>Capital needed</span><span>Net profit</span><span>ROI</span><span />
              </div>
              {routes.slice(0, visibleCount).map((route, index) => <TradeRouteRow key={route.id} route={route} rank={index + 1} cargoProfileLabel={cargoProfile.label} />)}
            </div>
          ) : (
            <section className="trade-empty">
              <PackageOpen size={28} aria-hidden="true" />
              <strong>No profitable routes match these filters</strong>
              <span>Try another ship, broaden the locations, remove the funds limit, or allow manually loaded terminals. Routes without a verified shared box size are excluded.</span>
            </section>
          )}
          {visibleCount < routes.length && (
            <div className="load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Show more routes</button></div>
          )}
        </section>
      )}
    </section>
  );
}

function TradeRouteRow({ route, rank, cargoProfileLabel }: { route: TradeRoute; rank: number; cargoProfileLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const [distanceGm, setDistanceGm] = useState<number | null>(null);
  const [distanceError, setDistanceError] = useState<string | null>(null);

  useEffect(() => {
    if (distanceGm !== null || distanceError) return;
    let active = true;
    void fetchTerminalDistance(route.origin.id, route.destination.id)
      .then((distance) => {
        if (active) setDistanceGm(distance);
      })
      .catch(() => {
        if (active) setDistanceError('Distance is unavailable for this route.');
      });
    return () => {
      active = false;
    };
  }, [distanceError, distanceGm, route.destination.id, route.origin.id]);

  const fallbackDistanceGm = estimateFallbackDistance(route.origin, route.destination);
  const effectiveDistanceGm = distanceGm ?? fallbackDistanceGm;
  const travelSeconds = estimateTravelSeconds(effectiveDistanceGm);
  const totalRouteSeconds = travelSeconds + route.handlingSeconds;
  const estimateLabel = distanceGm !== null
    ? 'travel + handling'
    : distanceError
      ? 'fallback estimate'
      : 'refining...';
  return (
    <article className={`trade-route ${expanded ? 'trade-route--expanded' : ''}`}>
      <button type="button" className="trade-route__summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="trade-route__identity"><small>#{rank}</small><strong>{route.commodityName}</strong><span>{route.origin.name} <b aria-hidden="true">→</b> {route.destination.name}</span></span>
        <span data-label="Est. time"><strong>{formatDuration(totalRouteSeconds)}</strong><small>{estimateLabel}</small></span>
        <span data-label="Cargo"><strong>{formatNumber(route.cargoScu)} SCU</strong><small>{formatBoxSizes(route.compatibleContainerSizes)}</small></span>
        <span data-label="Investment"><strong>{formatCurrency(route.investment)}</strong></span>
        <span data-label="Profit" className="trade-route__profit"><strong>+{formatCurrency(route.profit)}</strong></span>
        <span data-label="ROI"><strong>{route.roi.toFixed(1)}%</strong></span>
        <ChevronDown className="trade-route__chevron" size={19} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="trade-route__details">
          <div><span>Buy at</span><strong>{route.origin.name}</strong><small>{route.origin.location}, {route.origin.systemName}</small></div>
          <div><span>Purchase</span><strong>{formatNumber(route.cargoScu)} SCU at {formatUnitPrice(route.buyPrice)}</strong><small>{formatCurrency(route.commodityCost)} commodity cost</small><small>{formatNumber(route.availableSupply)} SCU reported supply</small><small>Available boxes: {formatBoxSizes(route.originContainerSizes)}</small></div>
          <div><span>Sell at</span><strong>{route.destination.name}</strong><small>{route.destination.location}, {route.destination.systemName}</small></div>
          <div><span>Sale</span><strong>{formatNumber(route.cargoScu)} SCU at {formatUnitPrice(route.sellPrice)}</strong><small>{formatNumber(route.availableDemand)} SCU reported demand</small><small>Accepted boxes: {formatBoxSizes(route.destinationContainerSizes)}</small></div>
          <div><span>Unit margin</span><strong>+{formatUnitPrice(route.unitProfit)}</strong><small>per SCU</small></div>
          <div><span>Oldest report</span><strong>{formatRelativeTime(route.updatedAt)}</strong><small>Market values are community reported</small></div>
          <div><span>Ship access</span><strong>{cargoProfileLabel}</strong><small>{formatCargoAccess(route.origin)} → {formatCargoAccess(route.destination)}</small></div>
          <div><span>Compatible boxes</span><strong>{formatBoxSizes(route.compatibleContainerSizes)}</strong><small>Every listed size is reported at both the purchase and drop-off terminals.</small></div>
          <div><span>Cargo handling</span><strong>{route.usesAutoload ? `${formatCurrency(route.handlingCost)} estimated fees` : 'Manual solo estimate'}</strong><small>Load: {formatDuration(route.loadingSeconds)}{route.usesAutoload ? ` · ${formatCurrency(route.loadingCost)}` : ''}</small><small>Unload: {formatDuration(route.unloadingSeconds)}{route.usesAutoload ? ` · ${formatCurrency(route.unloadingCost)}` : ''}</small><small>Total handling: {formatDuration(route.handlingSeconds)}</small><small>Estimated from {formatBoxManifest(route.boxManifest)}{route.usesAutoload ? '; verify at the in-game terminal.' : ' at 30 seconds per container.'}</small></div>
          <div><span>Estimated route time</span><strong>{formatDuration(totalRouteSeconds)}</strong><small>{formatDistance(effectiveDistanceGm)} · {formatDuration(travelSeconds)} estimated travel{distanceGm === null ? ' · approximate distance' : ''}</small><small>{formatDuration(route.handlingSeconds)} cargo handling</small><small>Excludes walking, elevators, ship retrieval, refueling, and unexpected delays.</small></div>
        </div>
      )}
    </article>
  );
}

function filterTerminals(
  snapshot: TradeMarketSnapshot | null,
  systemId: string,
  autoloadOnly: boolean,
  cargoAccessMode: Parameters<typeof terminalSupportsCargoMode>[1]
) {
  if (!snapshot) return [];
  return snapshot.terminals.filter((terminal) =>
    (!systemId || terminal.systemId === Number(systemId)) &&
    (!autoloadOnly || terminal.supportsAutoload) &&
    terminalSupportsCargoMode(terminal, cargoAccessMode)
  );
}

function formatCargoAccess(terminal: TradeRoute['origin']): string {
  if (terminal.hasDockingPort && terminal.hasLoadingDock) return `${terminal.name}: external dock`;
  if (terminal.hasFreightElevator) return `${terminal.name}: freight elevator`;
  return `${terminal.name}: standard cargo access`;
}

function formatBoxSizes(sizes: number[]): string {
  return `${sizes.join(', ')} SCU`;
}

function formatBoxManifest(manifest: TradeRoute['boxManifest']): string {
  return manifest.map((box) => `${box.count}×${box.size} SCU`).join(', ');
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function formatDistance(distanceGm: number): string {
  return `${distanceGm.toLocaleString(undefined, { maximumFractionDigits: 1 })} Gm`;
}

function estimateTravelSeconds(distanceGm: number): number {
  return Math.max(0, Math.ceil(distanceGm * UEX_ESTIMATED_SECONDS_PER_GM));
}

function estimateFallbackDistance(origin: TradeRoute['origin'], destination: TradeRoute['destination']): number {
  if (origin.systemId !== destination.systemId) {
    const systemPair = [origin.systemName, destination.systemName].sort().join('|');
    const knownSystemDistances: Record<string, number> = {
      'Nyx|Pyro': 58,
      'Nyx|Stanton': 136,
      'Pyro|Stanton': 64
    };
    return knownSystemDistances[systemPair] ?? 90;
  }

  if (origin.location === destination.location) return 4;
  const originParent = getLocationParent(origin.location);
  const destinationParent = getLocationParent(destination.location);
  if (originParent && originParent === destinationParent) return 18;
  return 50;
}

function getLocationParent(location: string): string {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatNumber(value: number): string {
  return Math.floor(value).toLocaleString();
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString()} aUEC`;
}

function formatUnitPrice(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} aUEC`;
}

function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'just now';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
