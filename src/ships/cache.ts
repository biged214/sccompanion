import type { ShipDetail, ShipsSnapshot } from './types';

const SNAPSHOT_KEY = 'sc-companion:ships-snapshot:v8';
const DETAIL_KEY = 'sc-companion:ship-details:v4';
const MAX_DETAIL_ENTRIES = 10;
const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedDetail {
  savedAt: string;
  detail: ShipDetail;
}

export function loadCachedShips(): ShipsSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShipsSnapshot;
    return parsed.fetchedAt && Array.isArray(parsed.ships) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedShips(snapshot: ShipsSnapshot): void {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The network result remains usable even when local storage is full.
  }
}

export function loadCachedShipDetail(uuid: string): ShipDetail | null {
  try {
    const entries = readDetailEntries();
    const cached = entries[uuid];
    if (!cached || Date.now() - Date.parse(cached.savedAt) > DETAIL_TTL_MS) return null;
    return cached.detail;
  } catch {
    return null;
  }
}

export function saveCachedShipDetail(detail: ShipDetail): void {
  try {
    const entries = readDetailEntries();
    entries[detail.uuid] = { savedAt: new Date().toISOString(), detail };
    const trimmed = Object.fromEntries(
      Object.entries(entries)
        .sort(([, left], [, right]) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
        .slice(0, MAX_DETAIL_ENTRIES)
    );
    window.localStorage.setItem(DETAIL_KEY, JSON.stringify(trimmed));
  } catch {
    // Detail caching is optional.
  }
}

function readDetailEntries(): Record<string, CachedDetail> {
  const raw = window.localStorage.getItem(DETAIL_KEY);
  return raw ? JSON.parse(raw) as Record<string, CachedDetail> : {};
}
