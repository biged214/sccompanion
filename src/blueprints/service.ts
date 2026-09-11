export interface Material { name: string; quantity_scu?: number | null; quantity?: number | null; min_quality?: number | null; }
export interface Requirement extends Material {
  kind?: string; required_count?: number | null; children?: Requirement[];
  modifiers?: { label?: string; name?: string; modifier_range?: { at_min_quality: number; at_max_quality: number } }[];
}
export interface Blueprint {
  uuid: string; output_name: string; game_version: string; craft_time_seconds: number | null;
  is_available_by_default: boolean; unlocking_missions_count: number;
  output?: { type_label?: string; grade?: string; }; ingredients: Material[]; dismantle_returns: Material[];
  unlocking_missions?: { title?: string; reward_scope?: string; web_url?: string }[];
  requirement_groups?: Requirement[];
  tiers?: { tier_index: number; craft_time_seconds?: number; requirements?: Requirement }[];
}
export interface Snapshot { version: string; fetchedAt: string; blueprints: Blueprint[]; }
export interface Version { code: string; is_default: boolean; }
const CACHE = 'sc-companion:blueprints:v1';

export function normalizeBlueprint(value: unknown): Blueprint {
  const raw = value as (Blueprint & { key?: string }) | null;
  const b = raw && { ...raw, output_name: raw.output_name || `Unknown output (${raw.key || raw.uuid})` };
  if (!validBlueprint(b)) throw new Error('Invalid blueprint response; previous cache retained.');
  return b;
}

export function validBlueprint(value: unknown): value is Blueprint {
  const b = value as Blueprint | null;
  return !!b && typeof b.uuid === 'string' && /^[\da-f-]{36}$/i.test(b.uuid) && typeof b.output_name === 'string' && typeof b.game_version === 'string' && Array.isArray(b.ingredients) && Array.isArray(b.dismantle_returns);
}
export function cachedBlueprints(): Snapshot | null {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return data && typeof data.version === 'string' && typeof data.fetchedAt === 'string' && Array.isArray(data.blueprints) && data.blueprints.every(validBlueprint) ? data : null;
  } catch { return null; }
}
export async function wikiJson(path: string, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 25_000);
  try {
    const response = window.__TAURI_INTERNALS__
      ? await (await import('@tauri-apps/plugin-http')).fetch(`https://api.star-citizen.wiki/api${path}`, { signal: controller.signal })
      : await window.fetch(`/api/sc-wiki${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Blueprint data unavailable (HTTP ${response.status}). Please try again later.`);
    return await response.json();
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}
export async function fetchBlueprints(version: string, signal: AbortSignal, progress: (n: number) => void = () => {}): Promise<Snapshot> {
  let resolvedVersion = version;
  let lastPage = 1;
  const rows = new Map<string, Blueprint>();
  for (let page = 1; page <= lastPage; page++) {
    const params = new URLSearchParams({ 'page[size]': '200', 'page[number]': String(page) });
    if (resolvedVersion) params.set('version', resolvedVersion);
    const response = await wikiJson(`/blueprints?${params}`, signal);
    if (signal.aborted) throw new Error('Request cancelled.');
    if (!Array.isArray(response.data)) throw new Error('Invalid blueprint response; previous cache retained.');
    const data = response.data.map(normalizeBlueprint) as Blueprint[];
    const count = response.meta?.last_page;
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Invalid blueprint pagination.');
    lastPage = count;
    resolvedVersion ||= data[0]?.game_version || '';
    for (const b of data) {
      if (b.game_version !== resolvedVersion) throw new Error('Game version changed during download. Please refresh.');
      rows.set(b.uuid, b);
    }
    progress(rows.size);
  }
  const snapshot = { version: resolvedVersion, fetchedAt: new Date().toISOString(), blueprints: [...rows.values()] };
  try { localStorage.setItem(CACHE, JSON.stringify(snapshot)); } catch { /* Browsing remains available if the cache is full. */ }
  return snapshot;
}
export function materialQuantity(m: Material): string {
  if (typeof m.quantity_scu === 'number' && Number.isFinite(m.quantity_scu)) return `${m.quantity_scu.toLocaleString(undefined, { maximumFractionDigits: 6 })} SCU`;
  if (typeof m.quantity === 'number' && Number.isFinite(m.quantity)) return `${m.quantity.toLocaleString()} item(s)`;
  return 'Quantity unknown';
}
export function acquisition(b: Blueprint): string {
  return b.is_available_by_default ? 'Available by default' : b.unlocking_missions_count > 0 ? 'Mission-linked' : 'Acquisition unknown';
}
export function blueprintSource(b: Blueprint): string {
  return `https://api.star-citizen.wiki/blueprints/${b.uuid}?version=${encodeURIComponent(b.game_version)}`;
}
export async function blueprintDetail(b: Blueprint, signal: AbortSignal): Promise<Blueprint> {
  const key = `${CACHE}:detail:${b.game_version}:${b.uuid}`;
  const data = await wikiJson(`/blueprints/${b.uuid}?version=${encodeURIComponent(b.game_version)}`, signal);
  data.data = normalizeBlueprint(data.data);
  if (data.data.uuid !== b.uuid || data.data.game_version !== b.game_version) throw new Error('Invalid blueprint detail.');
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(`${CACHE}:detail:`));
    if (keys.length >= 20) localStorage.removeItem(keys[0]);
    localStorage.setItem(key, JSON.stringify(data.data));
  } catch { /* Detail caching is best effort. */ }
  return data.data;
}
export function cachedDetail(b: Blueprint): Blueprint | null {
  try {
    const data = JSON.parse(localStorage.getItem(`${CACHE}:detail:${b.game_version}:${b.uuid}`) || 'null');
    return validBlueprint(data) && data.uuid === b.uuid && data.game_version === b.game_version ? data : null;
  } catch { return null; }
}
