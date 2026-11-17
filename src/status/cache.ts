import { saveFeedSnapshot } from '../articles/cache';
import type { StatusSnapshot } from './types';

const CACHE_KEY = 'star-citizen-status:last-snapshot';

export function loadCachedStatus(): StatusSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StatusSnapshot;
    if (!Array.isArray(parsed.updates) || !parsed.fetchedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
export function saveCachedStatus(snapshot: StatusSnapshot): void {
  saveFeedSnapshot(CACHE_KEY, snapshot);
}
