import { loadCachedPatchNotes, saveCachedPatchNotes } from './cache';
import { loadCachedPatchNoteDetail, saveCachedPatchNoteDetail } from './detailsCache';
import { parsePatchNoteArticle, parsePatchNotesForum } from './parser';
import type { PatchNotesSnapshot } from './types';

export const RSI_PATCH_NOTES_URL =
  'https://robertsspaceindustries.com/spectrum/community/SC/forum/190048';
const BROWSER_PATCH_NOTES_URL = '/api/rsi-patch-notes';

export async function fetchPatchNotesSnapshot(page = 1): Promise<PatchNotesSnapshot> {
  const html = await fetchPatchNotesPage(page);
  const snapshot = parsePatchNotesForum(html);
  if (page === 1) {
    saveCachedPatchNotes(snapshot);
  }
  return snapshot;
}

export function getCachedPatchNotesSnapshot(): PatchNotesSnapshot | null {
  return loadCachedPatchNotes();
}

export async function fetchPatchNoteDetails(url: string): Promise<string> {
  const cached = loadCachedPatchNoteDetail(url);
  if (cached) {
    return cached;
  }

  const html = await fetchSpectrumPage(url);
  const content = parsePatchNoteArticle(html);
  saveCachedPatchNoteDetail(url, content);
  return content;
}

async function fetchPatchNotesPage(page: number): Promise<string> {
  if (page === 1) {
    return fetchSpectrumPage(RSI_PATCH_NOTES_URL, BROWSER_PATCH_NOTES_URL);
  }

  return fetchSpectrumPage(`${RSI_PATCH_NOTES_URL}?page=${page}`);
}

async function fetchSpectrumPage(url: string, browserUrl?: string): Promise<string> {
  if (window.__TAURI_INTERNALS__) {
    const { fetch } = await import('@tauri-apps/plugin-http');
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Spectrum returned ${response.status}.`);
    }

    return response.text();
  }

  const spectrumUrl = new URL(url);
  const spectrumPath = `${spectrumUrl.pathname}${spectrumUrl.search}`;
  const response = await window.fetch(browserUrl ?? `/api/rsi-spectrum${spectrumPath}`);
  if (!response.ok) {
    throw new Error(`Spectrum returned ${response.status}.`);
  }

  return response.text();
}
