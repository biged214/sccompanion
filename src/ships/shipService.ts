import { loadCachedShipDetail, loadCachedShips, saveCachedShipDetail, saveCachedShips } from './cache';
import { normalizeLocationDisplayName } from '../locations/displayNames';
import type {
  ShipDetail,
  ShipEquipmentItem,
  ShipKind,
  ShipLocationPrice,
  ShipSummary,
  ShipTechnicalStat,
  ShipsSnapshot,
  ShipTurret
} from './types';

export const UEX_VEHICLES_URL = 'https://uexcorp.space/vehicles/home';
export const STAR_CITIZEN_WIKI_URL = 'https://api.star-citizen.wiki/vehicles';

const UEX_API = 'https://api.uexcorp.uk/2.0';
const WIKI_API = 'https://api.star-citizen.wiki/api';

interface UexResponse<T> {
  status: string;
  data: T;
}

interface UexVehicle extends Record<string, unknown> {
  id: number;
  uuid: string | null;
  slug: string;
  name: string;
  name_full: string;
  company_name: string | null;
  scu: number;
  crew: string;
  mass: number;
  width: number;
  height: number;
  length: number;
  is_addon: number;
  is_concept: number;
  is_ground_vehicle: number;
  is_spaceship: number;
  url_photo: string | null;
  url_store: string | null;
  pad_type: string | null;
  game_version: string;
}

interface UexPrice {
  id_vehicle: number;
  id_terminal: number;
  price_buy?: number;
  price_rent?: number;
  terminal_name: string;
  date_modified: number;
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

interface WikiVehicle {
  uuid: string;
  name: string;
  slug: string;
  manufacturer?: { name?: string };
  description?: { en_EN?: string };
  game_description?: string | { en_EN?: string };
  career?: string;
  role?: string;
  production_status?: { en_EN?: string };
  size_class?: number;
  cargo_capacity?: number;
  vehicle_inventory?: number;
  crew?: { min?: number; max?: number };
  mass_total?: number;
  dimension?: { length?: number; width?: number; height?: number };
  health?: number;
  shield_hp?: number;
  shield?: { hp?: number; regeneration?: number; face_type?: string };
  armor?: { health?: number };
  quantum?: { quantum_fuel_capacity?: number; quantum_speed?: number; quantum_spool_time?: number; quantum_range?: number };
  max_medical_tier?: string | null;
  weaponry?: { pilot_dps?: number; turret_dps?: number };
  weapon_snapshot?: {
    missile_count?: number;
    countermeasures_count?: number;
  };
  cargo_grids?: unknown[];
  cargo_limits?: { max_scu_box?: number };
  seating?: { beds?: number };
  fuel?: { capacity?: number; intake_rate?: number };
  speed?: { scm?: number; max?: number; boost_forward?: number; boost_backward?: number };
  agility?: { pitch?: number; yaw?: number; roll?: number };
  signature?: { ir_shields?: number; em_shields?: number };
  power?: { generation_segments?: number };
  cooling?: { generation_segments?: number };
  propulsion?: { thrusters?: Array<{ type?: string; count?: number; capacity?: number; g?: number }> };
  components?: WikiComponent[];
  ports?: WikiPort[] | null;
  turrets?: Partial<Record<'manned' | 'remote' | 'pdc', WikiTurret[]>>;
  msrp?: number | null;
  pledge_url?: string | null;
  version?: string;
}

interface WikiComponent {
  type?: string;
  name?: string;
  mounts?: number;
  size?: string | number;
  quantity?: number;
  manufacturer?: string;
  component_class?: string;
}

interface WikiPort {
  name?: string;
  type?: string;
  sub_type?: string;
  sizes?: { min?: number; max?: number };
  equipped_item?: WikiItem | null;
  ports?: WikiPort[] | null;
}

interface WikiItem {
  name?: string;
  class_name?: string;
  classification?: string;
  type?: string;
  type_label?: string;
  sub_type?: string;
  sub_type_label?: string;
  size?: number;
  manufacturer?: { name?: string };
  vehicle_weapon?: {
    type?: string;
    range?: number;
    rpm?: number;
    capacity?: number;
    damage_per_shot?: number;
    damage?: { burst?: number; sustained_60s?: number };
  };
}

interface WikiTurret {
  display_name?: string;
  hardpoint_name?: string;
  size?: number;
  mount_count?: number;
  weapon_sizes?: number[];
  dps_total?: number;
  sustained_dps_total?: number;
  is_pilot_slaveable?: boolean;
  weapons?: Array<{ name?: string }>;
}

const ROLE_FLAGS: Array<[keyof UexVehicle, string]> = [
  ['is_starter', 'Starter'],
  ['is_military', 'Combat'],
  ['is_cargo', 'Cargo'],
  ['is_exploration', 'Exploration'],
  ['is_mining', 'Mining'],
  ['is_salvage', 'Salvage'],
  ['is_medical', 'Medical'],
  ['is_racing', 'Racing'],
  ['is_bomber', 'Bomber'],
  ['is_carrier', 'Carrier'],
  ['is_passenger', 'Passenger'],
  ['is_refuel', 'Refueling'],
  ['is_repair', 'Repair'],
  ['is_datarunner', 'Data Running'],
  ['is_interdiction', 'Interdiction'],
  ['is_stealth', 'Stealth'],
  ['is_industrial', 'Industrial'],
  ['is_science', 'Science'],
  ['is_construction', 'Construction']
];

export async function fetchShipsSnapshot(): Promise<ShipsSnapshot> {
  const [vehicles, purchases, rentals, purchaseTerminals, rentalTerminals] = await Promise.all([
    fetchUex<UexVehicle[]>('/vehicles/'),
    fetchUex<UexPrice[]>('/vehicles_purchases_prices_all/'),
    fetchUex<UexPrice[]>('/vehicles_rentals_prices_all/'),
    fetchUex<UexTerminal[]>('/terminals/?type=vehicle_buy'),
    fetchUex<UexTerminal[]>('/terminals/?type=vehicle_rent')
  ]);

  const terminals = new Map<number, UexTerminal>();
  [...purchaseTerminals, ...rentalTerminals].forEach((terminal) => terminals.set(terminal.id, terminal));
  const purchasesByVehicle = groupPrices(purchases, terminals, 'purchase');
  const rentalsByVehicle = groupPrices(rentals, terminals, 'rental');

  const ships = vehicles
    .filter((vehicle) => !vehicle.is_addon && (vehicle.is_spaceship || vehicle.is_ground_vehicle))
    .map((vehicle): ShipSummary => {
      const crew = parseCrew(vehicle.crew);
      const kind: ShipKind = vehicle.is_ground_vehicle ? 'Ground Vehicle' : 'Ship';
      return {
        id: vehicle.id,
        uuid: vehicle.uuid,
        slug: vehicle.slug,
        name: vehicle.name,
        fullName: vehicle.name_full || vehicle.name,
        manufacturer: vehicle.company_name || 'Unknown manufacturer',
        kind,
        roles: ROLE_FLAGS.filter(([field]) => Number(vehicle[field]) === 1).map(([, label]) => label),
        isConcept: Boolean(vehicle.is_concept),
        cargoCapacity: numberOrZero(vehicle.scu),
        crewMin: crew.min,
        crewMax: crew.max,
        mass: numberOrZero(vehicle.mass),
        length: numberOrZero(vehicle.length),
        width: numberOrZero(vehicle.width),
        height: numberOrZero(vehicle.height),
        padType: vehicle.pad_type || null,
        imageUrl: vehicle.url_photo ? `/ships/${vehicle.id}${vehicle.url_photo.toLowerCase().endsWith('.png') ? '.png' : '.jpg'}` : null,
        fallbackImageUrl: vehicle.url_photo || null,
        pledgeUrl: vehicle.url_store || null,
        gameVersion: vehicle.game_version || 'Unknown',
        purchaseLocations: purchasesByVehicle.get(vehicle.id) ?? [],
        rentalLocations: rentalsByVehicle.get(vehicle.id) ?? []
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const snapshot = { fetchedAt: new Date().toISOString(), ships };
  saveCachedShips(snapshot);
  return snapshot;
}

export function getCachedShipsSnapshot(): ShipsSnapshot | null {
  return loadCachedShips();
}

export async function fetchShipDetail(ship: ShipSummary): Promise<ShipDetail> {
  const identifier = ship.uuid || ship.slug;
  if (!identifier) throw new Error('Detailed specifications are not available for this vehicle.');
  const cached = loadCachedShipDetail(identifier);
  if (cached) return cached;

  const response = await fetchJson<{ data: WikiVehicle }>(
    `${WIKI_API}/vehicles/${identifier}?include=ports,components`,
    `/api/sc-wiki/vehicles/${identifier}?include=ports,components`
  );
  const vehicle = response.data;
  const loadout = collectLoadout(vehicle.ports ?? [], vehicle.turrets);
  const detail: ShipDetail = {
    uuid: vehicle.uuid,
    name: vehicle.name || ship.name,
    manufacturer: vehicle.manufacturer?.name || ship.manufacturer,
    description: cleanDescription(vehicle.description?.en_EN || localizedText(vehicle.game_description)),
    career: vehicle.career || 'Unknown',
    role: vehicle.role || ship.roles.join(', ') || 'General',
    productionStatus: vehicle.production_status?.en_EN || (ship.isConcept ? 'concept' : 'flight-ready'),
    sizeClass: numberOrZero(vehicle.size_class),
    cargoCapacity: numberOrZero(vehicle.cargo_capacity || ship.cargoCapacity),
    inventoryCapacity: numberOrZero(vehicle.vehicle_inventory) / 1_000_000,
    crewMin: numberOrZero(vehicle.crew?.min || ship.crewMin),
    crewMax: numberOrZero(vehicle.crew?.max || ship.crewMax),
    mass: numberOrZero(vehicle.mass_total || ship.mass),
    length: numberOrZero(vehicle.dimension?.length || ship.length),
    width: numberOrZero(vehicle.dimension?.width || ship.width),
    height: numberOrZero(vehicle.dimension?.height || ship.height),
    scmSpeed: numberOrZero(vehicle.speed?.scm),
    maxSpeed: numberOrZero(vehicle.speed?.max),
    health: numberOrZero(vehicle.health),
    shieldHp: numberOrZero(vehicle.shield?.hp || vehicle.shield_hp),
    armorHealth: numberOrZero(vehicle.armor?.health),
    quantumFuelCapacity: numberOrZero(vehicle.quantum?.quantum_fuel_capacity),
    medicalTier: vehicle.max_medical_tier || null,
    pilotDps: numberOrZero(vehicle.weaponry?.pilot_dps),
    turretDps: numberOrZero(vehicle.weaponry?.turret_dps),
    missileCount: numberOrZero(vehicle.weapon_snapshot?.missile_count),
    countermeasureCount: numberOrZero(vehicle.weapon_snapshot?.countermeasures_count),
    shieldRegeneration: numberOrZero(vehicle.shield?.regeneration),
    shieldFaceType: vehicle.shield?.face_type || null,
    cargoGridCount: vehicle.cargo_grids?.length ?? 0,
    maxCargoBoxSize: numberOrZero(vehicle.cargo_limits?.max_scu_box),
    bedCount: numberOrZero(vehicle.seating?.beds),
    fuelCapacity: numberOrZero(vehicle.fuel?.capacity),
    fuelIntakeRate: numberOrZero(vehicle.fuel?.intake_rate),
    quantumSpeed: numberOrZero(vehicle.quantum?.quantum_speed),
    quantumSpoolTime: numberOrZero(vehicle.quantum?.quantum_spool_time),
    quantumRange: numberOrZero(vehicle.quantum?.quantum_range),
    boostForwardSpeed: numberOrZero(vehicle.speed?.boost_forward),
    boostBackwardSpeed: numberOrZero(vehicle.speed?.boost_backward),
    pitchRate: numberOrZero(vehicle.agility?.pitch),
    yawRate: numberOrZero(vehicle.agility?.yaw),
    rollRate: numberOrZero(vehicle.agility?.roll),
    infraredSignature: numberOrZero(vehicle.signature?.ir_shields),
    electromagneticSignature: numberOrZero(vehicle.signature?.em_shields),
    powerSegments: numberOrZero(vehicle.power?.generation_segments),
    coolingSegments: numberOrZero(vehicle.cooling?.generation_segments),
    weapons: loadout.filter((item) => item.type === 'Weapon'),
    missiles: loadout.filter((item) => item.type === 'Missile' || item.type === 'Missile rack'),
    components: normalizeComponents(vehicle.components ?? []),
    turrets: normalizeTurrets(vehicle.turrets),
    thrusters: (vehicle.propulsion?.thrusters ?? []).map((thruster) => ({
      type: thruster.type || 'Thruster',
      count: numberOrZero(thruster.count),
      capacityMn: numberOrZero(thruster.capacity),
      accelerationG: numberOrZero(thruster.g)
    })),
    msrp: vehicle.msrp ?? null,
    pledgeUrl: vehicle.pledge_url || ship.pledgeUrl,
    wikiUrl: `${STAR_CITIZEN_WIKI_URL}/${vehicle.slug}`,
    version: vehicle.version || ship.gameVersion
  };
  saveCachedShipDetail({ ...detail, uuid: identifier });
  return detail;
}

function collectLoadout(ports: WikiPort[], turretGroups?: WikiVehicle['turrets']): ShipEquipmentItem[] {
  const equipment: ShipEquipmentItem[] = [];
  const turretControls = new Map<string, string>();

  (['manned', 'remote', 'pdc'] as const).forEach((control) => {
    (turretGroups?.[control] ?? []).forEach((turret) => {
      if (!turret.hardpoint_name) return;
      const label = control === 'manned'
        ? 'Manned turret'
        : control === 'remote'
          ? `Remote turret${turret.is_pilot_slaveable ? ' (pilot slaveable)' : ''}`
          : 'Point-defense turret';
      turretControls.set(turret.hardpoint_name, label);
    });
  });

  function visit(items: WikiPort[], inheritedControl: string | null = null) {
    items.forEach((port) => {
      const item = port.equipped_item;
      const control = (port.name && turretControls.get(port.name)) || detectTurretControl(item) || inheritedControl;
      if (item?.name && item.type === 'WeaponGun') {
        equipment.push(toWeapon(item, port, control || 'Pilot controlled'));
      } else if (item?.name && (item.type === 'Missile' || item.type === 'MissileLauncher')) {
        equipment.push(toMissile(item, port, control || 'Pilot controlled'));
      }
      if (port.ports?.length) visit(port.ports, control);
    });
  }

  visit(ports);
  return mergeEquipment(equipment);
}

function detectTurretControl(item?: WikiItem | null): string | null {
  if (!item || (item.type !== 'Turret' && !/turret/i.test(item.classification || ''))) return null;
  const identity = `${item.name || ''} ${item.class_name || ''} ${item.classification || ''}`;
  if (/point[\s_-]?defen[cs]e|\bpdc\b/i.test(identity)) return 'Point-defense turret';
  if (/manned/i.test(identity)) return 'Manned turret';
  if (/remote/i.test(identity)) return 'Remote turret';
  return null;
}

function toWeapon(item: WikiItem, port: WikiPort, control: string): ShipEquipmentItem {
  const weapon = item.vehicle_weapon;
  return {
    name: item.name || 'Unknown weapon',
    type: 'Weapon',
    control,
    size: item.size ?? port.sizes?.max ?? null,
    quantity: 1,
    manufacturer: item.manufacturer?.name || null,
    details: compactStats([
      ['Type', weapon?.type || item.sub_type_label || item.sub_type],
      ['Range', weapon?.range ? `${formatDataNumber(weapon.range)} m` : null],
      ['Rate of fire', weapon?.rpm ? `${formatDataNumber(weapon.rpm)} RPM` : null],
      ['Capacity', weapon?.capacity ? formatDataNumber(weapon.capacity) : null],
      ['Damage / shot', weapon?.damage_per_shot ? formatDataNumber(weapon.damage_per_shot) : null],
      ['Burst DPS', weapon?.damage?.burst ? formatDataNumber(weapon.damage.burst) : null],
      ['Sustained DPS', weapon?.damage?.sustained_60s ? formatDataNumber(weapon.damage.sustained_60s) : null]
    ])
  };
}

function toMissile(item: WikiItem, port: WikiPort, control: string): ShipEquipmentItem {
  return {
    name: item.name || 'Unknown missile equipment',
    type: item.type === 'Missile' ? 'Missile' : 'Missile rack',
    control,
    size: item.size ?? port.sizes?.max ?? null,
    quantity: 1,
    manufacturer: item.manufacturer?.name || null,
    details: compactStats([['Type', item.sub_type_label || item.sub_type]])
  };
}

function normalizeComponents(components: WikiComponent[]): ShipEquipmentItem[] {
  return components.map((component) => ({
    name: component.name || 'Unspecified component',
    type: humanize(component.type || component.component_class || 'Component'),
    control: null,
    size: numberOrNull(component.size),
    quantity: Math.max(1, numberOrZero(component.mounts) * Math.max(1, numberOrZero(component.quantity))),
    manufacturer: component.manufacturer || null,
    details: []
  }));
}

function normalizeTurrets(groups?: WikiVehicle['turrets']): ShipTurret[] {
  if (!groups) return [];
  return (['manned', 'remote', 'pdc'] as const).flatMap((control) =>
    (groups[control] ?? []).map((turret) => ({
      name: cleanPortName(turret.display_name) || `${humanize(control)} turret`,
      control: control === 'pdc' ? 'Point defense' : humanize(control),
      size: numberOrNull(turret.size),
      mountCount: numberOrZero(turret.mount_count),
      weaponSizes: turret.weapon_sizes ?? [],
      weapons: [...new Set((turret.weapons ?? []).map((weapon) => weapon.name).filter((name): name is string => Boolean(name)))],
      dps: numberOrZero(turret.dps_total),
      sustainedDps: numberOrZero(turret.sustained_dps_total),
      pilotSlaveable: Boolean(turret.is_pilot_slaveable)
    }))
  );
}

function mergeEquipment(items: ShipEquipmentItem[]): ShipEquipmentItem[] {
  const merged = new Map<string, ShipEquipmentItem>();
  items.forEach((item) => {
    const key = `${item.type}|${item.name}|${item.size ?? ''}|${item.control ?? ''}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += item.quantity;
    else merged.set(key, { ...item });
  });
  return [...merged.values()].sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name));
}

function compactStats(entries: Array<[string, string | undefined | null]>): ShipTechnicalStat[] {
  return entries.filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => ({ label, value }));
}

function localizedText(value?: string | { en_EN?: string }): string {
  return typeof value === 'string' ? value : value?.en_EN || '';
}

function cleanPortName(value?: string): string {
  return value?.startsWith('port_') ? '' : (value || '');
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDataNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function groupPrices(
  prices: UexPrice[],
  terminals: Map<number, UexTerminal>,
  type: 'purchase' | 'rental'
): Map<number, ShipLocationPrice[]> {
  const grouped = new Map<number, ShipLocationPrice[]>();
  prices.forEach((price) => {
    const amount = type === 'purchase' ? price.price_buy : price.price_rent;
    if (!amount) return;
    const entry: ShipLocationPrice = {
      terminal: normalizeLocationDisplayName(price.terminal_name),
      location: formatLocation(terminals.get(price.id_terminal)),
      price: amount,
      updatedAt: new Date(price.date_modified * 1000).toISOString()
    };
    grouped.set(price.id_vehicle, [...(grouped.get(price.id_vehicle) ?? []), entry]);
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

function parseCrew(value: string): { min: number; max: number } {
  const values = String(value || '0').split(',').map(Number).filter(Number.isFinite);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
}

function cleanDescription(value: string): string {
  return value.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchUex<T>(path: string): Promise<T> {
  const response = await fetchJson<UexResponse<T>>(`${UEX_API}${path}`, `/api/uex${path}`);
  if (response.status !== 'ok') throw new Error('UEX returned an unexpected response.');
  return response.data;
}

async function fetchJson<T>(nativeUrl: string, browserUrl: string): Promise<T> {
  const response = window.__TAURI_INTERNALS__
    ? await (await import('@tauri-apps/plugin-http')).fetch(nativeUrl, { method: 'GET' })
    : await window.fetch(browserUrl);
  if (!response.ok) throw new Error(`Ship data source returned ${response.status}.`);
  return response.json() as Promise<T>;
}
