import { parsePublicRsiProfile } from './parser';
import type { PublicRsiProfile } from './types';

export const RSI_ACCOUNT_DASHBOARD_URL = 'https://robertsspaceindustries.com/en/account/dashboard';

export function getPublicRsiProfileUrl(handle: string): string {
  return `https://robertsspaceindustries.com/en/citizens/${encodeURIComponent(handle.trim())}`;
}

export async function fetchPublicRsiProfile(handle: string): Promise<PublicRsiProfile> {
  const normalizedHandle = handle.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(normalizedHandle)) {
    throw new Error('Enter a valid public RSI handle.');
  }

  const url = getPublicRsiProfileUrl(normalizedHandle);
  const response = window.__TAURI_INTERNALS__
    ? await fetchWithTauri(url)
    : await window.fetch(`/api/rsi-citizens/en/citizens/${encodeURIComponent(normalizedHandle)}`);

  if (!response.ok) {
    throw new Error(response.status === 404 ? 'No public RSI profile was found for that handle.' : `RSI returned ${response.status}.`);
  }

  return parsePublicRsiProfile(await response.text(), normalizedHandle);
}

async function fetchWithTauri(url: string): Promise<Response> {
  const { fetch } = await import('@tauri-apps/plugin-http');
  return fetch(url, { method: 'GET' });
}
