import {
  loadCachedComponentDetail,
  loadCachedComponents,
  saveCachedComponentDetail,
  saveCachedComponents
} from './cache';
import { normalizeLocationDisplayName } from '../locations/displayNames';
import type {
  ComponentDetail,
  ComponentLocationPrice,
  ComponentSpec,
  ComponentSummary,
  ComponentsSnapshot
} from './types';

export const UEX_COMPONENTS_URL = 'https://uexcorp.space/items/home';

const UEX_API = 'https://api.uexcorp.uk/2.0';
const WIKI_API = 'https://api.star-citizen.wiki/api';

const COMPONENT_CATEGORY_IDS = [
  19, 21, 22, 23,
  82, 83, 86,
  74,
  25, 26, 29, 30, 31, 67, 110,
  32, 33, 34, 35, 70, 79, 90
];

interface UexResponse<T> {
  status: string;
  data: T;
}

interface UexItem {
  id: number;
  id_category: number;
  name: string;
  section: string | null;
  category: string | null;
  company_name: string | null;
  size: string | number | null;
  uuid: string | null;
  game_version: string | null;
}

interface UexItemPrice {
  id_item: number;
  id_category: number;
  id_terminal: number;
  price_buy: number;
  date_modified: number;
  terminal_name: string;
}

interface UexTerminal {
  id: number;
  displayname: string;
  star_system_name: string | null;
  planet_name: string | null;
  moon_name: string | null;
  space_station_name: string | null;
  outpost_name: string | null;
  city_name: string | null;
}

interface WikiItem {
  uuid: string;
  slug: string;
  name: string;
  description?: { en_EN?: string };
  size?: number;
  mass?: number;
  grade?: string;
  class?: string;
  type?: string;
  type_label?: string;
  sub_type?: string;
  sub_type_label?: string;
  manufacturer?: { name?: string };
  durability?: { health?: number; repairable?: boolean };
  dimension?: { dimensions?: { width?: number; height?: number; length?: number } };
  images?: Array<{ thumbnail_url?: string; original_url?: string }>;
  power_plant?: { power_output?: number; power_segment_generation?: number };
  cooler?: { cooling_rate?: number; coolant_segment_generation?: number };
  shield?: { max_shield_health?: number; max_health?: number; regen_rate?: number; regen_time?: number };
  quantum_drive?: {
    fuel_efficiency?: number;
    standard_jump?: { drive_speed_formatted?: string; spool_up_time?: number; cooldown_time?: number };
  };
  vehicle_weapon?: {
    type?: string;
    range?: number;
    damage_per_shot?: number;
    rpm?: number;
    damage?: { burst?: number; sustained_60s?: number };
  };
  missile?: {
    signal_type?: string;
    speed?: number;
    lock_range_min?: number;
    lock_range_max?: number;
    damage_total?: number;
  };
  mining_laser?: {
    mining_laser_power?: string;
    optimal_range?: number;
    maximum_range?: number;
    module_slots?: number;
    extraction_throughput?: number;
  };
  resource_network?: {
    generation?: { power?: number | null; coolant?: number | null };
    usage?: { power?: { min?: number; max?: number } };
  };
  web_url?: string;
  version?: string;
}

export async function fetchComponentsSnapshot(): Promise<ComponentsSnapshot> {
  const [categoryResults, prices, terminals] = await Promise.all([
    Promise.all(COMPONENT_CATEGORY_IDS.map((id) => fetchUex<UexItem[]>(`/items?id_category=${id}`))),
    fetchUex<UexItemPrice[]>('/items_prices_all'),
    fetchUex<UexTerminal[]>('/terminals?type=item')
  ]);

  const categoryIds = new Set(COMPONENT_CATEGORY_IDS);
  const terminalMap = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const pricesByItem = groupPrices(prices.filter((price) => categoryIds.has(price.id_category)), terminalMap);
  const seen = new Set<number>();
  const components = categoryResults
    .flat()
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item): ComponentSummary => ({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      manufacturer: item.company_name || 'Unknown manufacturer',
      section: item.section || 'Ship Components',
      category: item.category || 'Component',
      size: String(item.size || '—'),
      gameVersion: item.game_version || 'Unknown',
      purchaseLocations: pricesByItem.get(item.id) ?? []
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const snapshot = { fetchedAt: new Date().toISOString(), components };
  saveCachedComponents(snapshot);
  return snapshot;
}

export function getCachedComponentsSnapshot(): ComponentsSnapshot | null {
  return loadCachedComponents();
}

export async function fetchComponentDetail(component: ComponentSummary): Promise<ComponentDetail> {
  if (!component.uuid) throw new Error('Detailed specifications are not available for this component.');
  const cached = loadCachedComponentDetail(component.uuid);
  if (cached) return cached;

  const response = await fetchJson<{ data: WikiItem }>(
    `${WIKI_API}/items/${component.uuid}`,
    `/api/sc-wiki/items/${component.uuid}`
  );
  const item = response.data;
  const image = item.images?.[0];
  const detail: ComponentDetail = {
    uuid: item.uuid,
    name: item.name || component.name,
    manufacturer: item.manufacturer?.name || component.manufacturer,
    description: cleanDescription(item.description?.en_EN || ''),
    type: item.type_label || item.type || component.category,
    subType: item.sub_type_label || item.sub_type || '',
    size: numberOrZero(item.size || component.size),
    grade: item.grade || 'Unknown',
    itemClass: item.class || 'Unknown',
    mass: numberOrZero(item.mass),
    health: numberOrZero(item.durability?.health),
    repairable: item.durability?.repairable ?? null,
    imageUrl: image?.thumbnail_url || image?.original_url || null,
    wikiUrl: item.web_url || `https://api.star-citizen.wiki/items/${item.slug}`,
    version: item.version || component.gameVersion,
    specifications: collectSpecifications(item)
  };
  saveCachedComponentDetail(detail);
  return detail;
}

function groupPrices(
  prices: UexItemPrice[],
  terminals: Map<number, UexTerminal>
): Map<number, ComponentLocationPrice[]> {
  const grouped = new Map<number, ComponentLocationPrice[]>();
  prices.forEach((price) => {
    if (!price.price_buy) return;
    const entry: ComponentLocationPrice = {
      terminal: normalizeLocationDisplayName(price.terminal_name),
      location: formatLocation(terminals.get(price.id_terminal)),
      price: price.price_buy,
      updatedAt: new Date(price.date_modified * 1000).toISOString()
    };
    grouped.set(price.id_item, [...(grouped.get(price.id_item) ?? []), entry]);
  });
  grouped.forEach((entries) => entries.sort((left, right) => left.price - right.price));
  return grouped;
}

function formatLocation(terminal?: UexTerminal): string {
  if (!terminal) return 'Location details unavailable';
  const parts = [
    terminal.space_station_name || terminal.city_name || terminal.outpost_name || terminal.moon_name || terminal.displayname,
    terminal.planet_name,
    terminal.star_system_name
  ]
    .map(normalizeLocationDisplayName)
    .filter((part, index, values) => Boolean(part) && values.indexOf(part) === index);
  return parts.join(', ');
}

function collectSpecifications(item: WikiItem): ComponentSpec[] {
  const specs: ComponentSpec[] = [];
  addSpec(specs, 'Power generation', item.power_plant?.power_output ?? item.power_plant?.power_segment_generation, ' pwr/s');
  addSpec(specs, 'Cooling generation', item.cooler?.cooling_rate ?? item.cooler?.coolant_segment_generation, ' cool/s');
  addSpec(specs, 'Shield health', item.shield?.max_shield_health ?? item.shield?.max_health, ' HP');
  addSpec(specs, 'Shield regeneration', item.shield?.regen_rate, ' HP/s');
  addSpec(specs, 'Shield regeneration time', item.shield?.regen_time, ' s');
  addTextSpec(specs, 'Quantum speed', item.quantum_drive?.standard_jump?.drive_speed_formatted);
  addSpec(specs, 'Spool time', item.quantum_drive?.standard_jump?.spool_up_time, ' s');
  addSpec(specs, 'Cooldown', item.quantum_drive?.standard_jump?.cooldown_time, ' s');
  addSpec(specs, 'Fuel efficiency', item.quantum_drive?.fuel_efficiency);
  addTextSpec(specs, 'Weapon type', item.vehicle_weapon?.type);
  addSpec(specs, 'Range', item.vehicle_weapon?.range, ' m');
  addSpec(specs, 'Damage per shot', item.vehicle_weapon?.damage_per_shot);
  addSpec(specs, 'Rate of fire', item.vehicle_weapon?.rpm, ' RPM');
  addSpec(specs, 'Burst DPS', item.vehicle_weapon?.damage?.burst);
  addSpec(specs, 'Sustained DPS', item.vehicle_weapon?.damage?.sustained_60s);
  addTextSpec(specs, 'Tracking signal', item.missile?.signal_type);
  addSpec(specs, 'Missile damage', item.missile?.damage_total);
  addSpec(specs, 'Missile speed', item.missile?.speed, ' m/s');
  if (item.missile?.lock_range_min != null && item.missile?.lock_range_max != null) {
    addTextSpec(specs, 'Lock range', `${formatNumber(item.missile.lock_range_min)}–${formatNumber(item.missile.lock_range_max)} m`);
  }
  addTextSpec(specs, 'Mining power', item.mining_laser?.mining_laser_power);
  addSpec(specs, 'Optimal range', item.mining_laser?.optimal_range, ' m');
  addSpec(specs, 'Maximum range', item.mining_laser?.maximum_range, ' m');
  addSpec(specs, 'Module slots', item.mining_laser?.module_slots);
  addSpec(specs, 'Extraction throughput', item.mining_laser?.extraction_throughput);
  addSpec(specs, 'Power use', item.resource_network?.usage?.power?.max, ' pwr/s');
  return specs.slice(0, 12);
}

function addSpec(specs: ComponentSpec[], label: string, value: unknown, suffix = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return;
  specs.push({ label, value: `${formatNumber(numeric)}${suffix}` });
}

function addTextSpec(specs: ComponentSpec[], label: string, value: string | null | undefined) {
  if (value) specs.push({ label, value });
}

function cleanDescription(value: string): string {
  return value.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

async function fetchUex<T>(path: string): Promise<T> {
  const response = await fetchJson<UexResponse<T>>(`${UEX_API}${path}`, `/api/uex${path}`);
  if (response.status !== 'ok') throw new Error('UEX returned an unexpected component response.');
  return response.data;
}

async function fetchJson<T>(nativeUrl: string, browserUrl: string): Promise<T> {
  const response = window.__TAURI_INTERNALS__
    ? await (await import('@tauri-apps/plugin-http')).fetch(nativeUrl, { method: 'GET' })
    : await window.fetch(browserUrl);
  if (!response.ok) throw new Error(`Component source returned ${response.status}.`);
  return response.json() as Promise<T>;
}
