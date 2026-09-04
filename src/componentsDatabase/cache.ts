import type { ComponentDetail, ComponentsSnapshot } from './types';

const SNAPSHOT_KEY = 'sc-companion:components-snapshot:v2';
const DETAIL_KEY = 'sc-companion:component-details:v1';
const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DETAIL_ENTRIES = 20;

interface CachedDetail {
  savedAt: string;
  detail: ComponentDetail;
}

export function loadCachedComponents(): ComponentsSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComponentsSnapshot;
    return parsed.fetchedAt && Array.isArray(parsed.components) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedComponents(snapshot: ComponentsSnapshot): void {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The live result remains usable when local storage is unavailable.
  }
}

export function loadCachedComponentDetail(uuid: string): ComponentDetail | null {
  try {
    const cached = readDetails()[uuid];
    if (!cached || Date.now() - Date.parse(cached.savedAt) > DETAIL_TTL_MS) return null;
    return cached.detail;
  } catch {
    return null;
  }
}

export function saveCachedComponentDetail(detail: ComponentDetail): void {
  try {
    const details = readDetails();
    details[detail.uuid] = { savedAt: new Date().toISOString(), detail };
    const trimmed = Object.fromEntries(
      Object.entries(details)
        .sort(([, left], [, right]) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
        .slice(0, MAX_DETAIL_ENTRIES)
    );
    window.localStorage.setItem(DETAIL_KEY, JSON.stringify(trimmed));
  } catch {
    // Detail caching is optional.
  }
}

function readDetails(): Record<string, CachedDetail> {
  const raw = window.localStorage.getItem(DETAIL_KEY);
  return raw ? JSON.parse(raw) as Record<string, CachedDetail> : {};
}
