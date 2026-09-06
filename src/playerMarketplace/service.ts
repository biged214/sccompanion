export interface PlayerListing {
  id: string;
  provider: string;
  transaction: string;
  title: string;
  description: string;
  seller: string;
  location: string;
  system: string;
  price: number | null;
  currency: string;
  unit: string;
  stock: number | null;
  availability: string;
  origin: string;
  added: number;
  expires: number;
  photos: string[];
  url: string;
}

interface Provider {
  id: string;
  name: string;
  url: string;
  load: (seller: string, signal: AbortSignal) => Promise<PlayerListing[]>;
}

export const listingProviders: Provider[] = [
  { id: 'uex', name: 'UEX Corp', url: 'https://uexcorp.space/marketplace', load: loadUex }
];

async function request(path: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const native = Boolean(window.__TAURI_INTERNALS__);
  const fetcher = native ? (await import('@tauri-apps/plugin-http')).fetch : window.fetch.bind(window);
  const response = await fetcher(`${native ? 'https://api.uexcorp.uk/2.0' : '/api/uex'}${path}`, { signal });
  if (!response.ok) throw new Error(`UEX request failed (${response.status}).`);
  const body = await response.json();
  if (body.status !== 'ok' || !Array.isArray(body.data)) throw new Error('UEX returned an invalid listing response.');
  return body.data;
}

async function loadUex(seller: string, signal: AbortSignal): Promise<PlayerListing[]> {
  const params = new URLSearchParams();
  if (seller.trim()) params.set('username', seller.trim());
  const [rows, systems] = await Promise.all([
    request(`/marketplace_listings/?${params}`, signal),
    request('/star_systems', signal).catch(() => [])
  ]);
  const names = new Map(systems.map((system) => [Number(system.id), String(system.name)]));
  return rows.filter((row) => row.type === 'item' && Number(row.is_sold_out) !== 1)
    .map((row) => ({
      id: `uex:${row.id}`, provider: 'uex', title: text(row.title), description: plainText(text(row.description)),
      transaction: text(row.operation).trim().toLowerCase() || 'unspecified',
      seller: text(row.user_username) || text(row.user_name), location: text(row.location) || 'Unspecified',
      system: names.get(Number(row.id_star_system)) || 'Unspecified', price: numeric(row.price),
      currency: text(row.currency) || 'Unspecified', unit: text(row.unit), stock: numeric(row.in_stock),
      availability: text(row.availability).replace(/_/g, ' ') || 'Unspecified',
      origin: text(row.source).replace(/_/g, ' ') || 'Unspecified',
      added: Number(row.date_added) * 1000 || 0, expires: Number(row.date_expiration) * 1000 || 0,
      photos: photos(row.photos),
      url: `https://uexcorp.space/marketplace/item/info/${encodeURIComponent(text(row.slug))}/`
    }));
}

export function transactionLabel(operation: string): string {
  if (operation === 'sell') return 'WTS - Want to sell';
  if (operation === 'buy') return 'WTB - Want to buy';
  if (operation === 'trade') return 'WTT - Want to trade';
  if (!operation || operation === 'unspecified') return 'Transaction unspecified';
  return operation.replace(/_/g, ' ');
}

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function plainText(value: string): string {
  const doc = new DOMParser().parseFromString(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n\n'), 'text/html');
  return doc.body.textContent?.trim() ?? '';
}
function photos(value: unknown): string[] {
  let values: unknown = value;
  if (typeof value === 'string') {
    try { values = JSON.parse(value); } catch { values = value.split(','); }
  }
  if (!Array.isArray(values)) return [];
  return values.filter((url): url is string => {
    if (typeof url !== 'string') return false;
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname.endsWith('.uexcorp.space'); }
    catch { return false; }
  }).slice(0, 6);
}
