import { loadCachedTradeMarket, saveCachedTradeMarket } from './cache';
import { firstFriendlyLocationName, normalizeLocationDisplayName } from '../locations/displayNames';
import type { CommodityPrice, TradeMarketSnapshot, TradeTerminal } from './types';

export const UEX_TRADE_URL = 'https://uexcorp.space/trade';
const UEX_API = 'https://api.uexcorp.uk/2.0';
const DISTANCE_CACHE_KEY = 'sc-companion:terminal-distances:v1';
const DISTANCE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DISTANCE_MAX_CONCURRENT_REQUESTS = 4;
const DISTANCE_MAX_ATTEMPTS = 3;
const inFlightDistanceRequests = new Map<string, Promise<number>>();
const distanceRequestQueue: Array<() => void> = [];
let activeDistanceRequests = 0;

interface UexResponse<T> {
  status: string;
  data: T;
}

interface UexSystem {
  id: number;
  name: string;
  is_available_live: number;
  is_visible: number;
}

interface UexTerminal {
  id: number;
  id_star_system: number;
  name: string;
  nickname: string | null;
  displayname: string | null;
  is_available_live: number;
  is_visible: number;
  is_auto_load: number;
  has_loading_dock: number;
  has_docking_port: number;
  has_freight_elevator: number;
  max_container_size: number;
  star_system_name: string | null;
  planet_name: string | null;
  moon_name: string | null;
  space_station_name: string | null;
  outpost_name: string | null;
  city_name: string | null;
}

interface UexPrice {
  id_commodity: number;
  id_terminal: number;
  price_buy: number;
  price_sell: number;
  scu_buy: number;
  scu_sell_stock: number;
  container_sizes: string | null;
  commodity_name: string;
  date_modified: number;
}

interface UexTerminalDistance {
  distance: number | string;
}

interface CachedDistance {
  distance: number;
  fetchedAt: number;
}

export async function fetchTradeMarket(): Promise<TradeMarketSnapshot> {
  const [systemsRaw, terminalsRaw, pricesRaw] = await Promise.all([
    fetchUex<UexSystem[]>('/star_systems'),
    fetchUex<UexTerminal[]>('/terminals/?type=commodity'),
    fetchUex<UexPrice[]>('/commodities_prices_all')
  ]);

  const systems = systemsRaw
    .filter((system) => system.is_available_live && system.is_visible)
    .map((system) => ({ id: system.id, name: system.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const liveSystemIds = new Set(systems.map((system) => system.id));

  const terminals: TradeTerminal[] = terminalsRaw
    .filter((terminal) => terminal.is_available_live && terminal.is_visible && liveSystemIds.has(terminal.id_star_system))
    .map((terminal) => ({
      id: terminal.id,
      name: firstFriendlyLocationName(terminal.nickname, terminal.displayname, terminal.space_station_name, terminal.name),
      systemId: terminal.id_star_system,
      systemName: terminal.star_system_name || 'Unknown system',
      location: formatTerminalLocation(terminal),
      supportsAutoload: Boolean(terminal.is_auto_load),
      hasDockingPort: Boolean(terminal.has_docking_port),
      hasLoadingDock: Boolean(terminal.has_loading_dock),
      hasFreightElevator: Boolean(terminal.has_freight_elevator),
      maxContainerSize: numberOrZero(terminal.max_container_size)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const terminalIds = new Set(terminals.map((terminal) => terminal.id));

  const prices: CommodityPrice[] = pricesRaw
    .filter((price) => terminalIds.has(price.id_terminal) && (price.price_buy > 0 || price.price_sell > 0))
    .map((price) => ({
      commodityId: price.id_commodity,
      commodityName: price.commodity_name,
      terminalId: price.id_terminal,
      buyPrice: numberOrZero(price.price_buy),
      sellPrice: numberOrZero(price.price_sell),
      supply: numberOrZero(price.scu_buy),
      demand: numberOrZero(price.scu_sell_stock),
      containerSizes: parseContainerSizes(price.container_sizes),
      updatedAt: price.date_modified > 0 ? new Date(price.date_modified * 1000).toISOString() : new Date(0).toISOString()
    }));

  const snapshot = { fetchedAt: new Date().toISOString(), systems, terminals, prices };
  saveCachedTradeMarket(snapshot);
  return snapshot;
}

export function getCachedTradeMarket(): TradeMarketSnapshot | null {
  return loadCachedTradeMarket();
}

export async function fetchTerminalDistance(originId: number, destinationId: number): Promise<number> {
  const key = `${originId}-${destinationId}`;
  const cached = loadDistanceCache()[key];
  if (cached && Date.now() - cached.fetchedAt < DISTANCE_CACHE_TTL_MS) return cached.distance;
  const inFlight = inFlightDistanceRequests.get(key);
  if (inFlight) return inFlight;

  const request = scheduleDistanceRequest(() => fetchTerminalDistanceWithRetry(originId, destinationId)).then((result) => {
    const distance = Number(result.distance);
    if (!Number.isFinite(distance) || distance < 0) throw new Error('UEX returned an invalid route distance.');
    const cache = loadDistanceCache();
    cache[key] = { distance, fetchedAt: Date.now() };
    saveDistanceCache(cache);
    return distance;
  }).finally(() => {
    inFlightDistanceRequests.delete(key);
  });
  inFlightDistanceRequests.set(key, request);
  return request;
}

async function fetchTerminalDistanceWithRetry(originId: number, destinationId: number): Promise<UexTerminalDistance> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DISTANCE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fetchUex<UexTerminalDistance>(
        `/terminals_distances?id_terminal_origin=${originId}&id_terminal_destination=${destinationId}`
      );
    } catch (error) {
      lastError = error;
      if (attempt < DISTANCE_MAX_ATTEMPTS) await delay(attempt * 350);
    }
  }
  throw lastError;
}

function scheduleDistanceRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    distanceRequestQueue.push(() => {
      activeDistanceRequests += 1;
      void request().then(resolve, reject).finally(() => {
        activeDistanceRequests -= 1;
        runNextDistanceRequest();
      });
    });
    runNextDistanceRequest();
  });
}

function runNextDistanceRequest(): void {
  while (activeDistanceRequests < DISTANCE_MAX_CONCURRENT_REQUESTS && distanceRequestQueue.length > 0) {
    distanceRequestQueue.shift()?.();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchUex<T>(path: string): Promise<T> {
  const url = window.__TAURI_INTERNALS__ ? `${UEX_API}${path}` : `/api/uex${path}`;
  const response = window.__TAURI_INTERNALS__
    ? await (await import('@tauri-apps/plugin-http')).fetch(url, { method: 'GET' })
    : await window.fetch(url);
  if (!response.ok) throw new Error(`UEX market data returned ${response.status}.`);
  const result = await response.json() as UexResponse<T>;
  if (result.status !== 'ok') throw new Error('UEX returned an unexpected market response.');
  return result.data;
}

function formatTerminalLocation(terminal: UexTerminal): string {
  const primary = firstFriendlyLocationName(
    terminal.space_station_name,
    terminal.city_name,
    terminal.outpost_name,
    terminal.moon_name,
    terminal.planet_name
  );
  const parent = firstFriendlyLocationName(terminal.moon_name, terminal.planet_name);
  const parts = [primary, parent]
    .map(normalizeLocationDisplayName)
    .filter((part, index, values) => Boolean(part) && values.indexOf(part) === index);
  return parts.length > 0 ? parts.slice(0, 2).join(', ') : normalizeLocationDisplayName(terminal.star_system_name) || 'Unknown location';
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseContainerSizes(value: string | null): number[] {
  if (!value) return [];
  return [...new Set(value.split(',').map(Number).filter((size) => Number.isFinite(size) && size > 0))]
    .sort((left, right) => left - right);
}

function loadDistanceCache(): Record<string, CachedDistance> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISTANCE_CACHE_KEY) ?? '{}') as Record<string, CachedDistance>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveDistanceCache(cache: Record<string, CachedDistance>): void {
  try {
    window.localStorage.setItem(DISTANCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Distance remains available for the expanded route if browser storage is full.
  }
}
