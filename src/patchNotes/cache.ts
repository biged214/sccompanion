import type { PatchNotesSnapshot } from './types';

const CACHE_KEY = 'star-citizen-status:patch-notes-snapshot';

export function loadCachedPatchNotes(): PatchNotesSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PatchNotesSnapshot;
    if (!Array.isArray(parsed.notes) || !parsed.fetchedAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedPatchNotes(snapshot: PatchNotesSnapshot): void {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
}
