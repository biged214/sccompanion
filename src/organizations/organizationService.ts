import { parseOrganizationDetail, parseOrganizationMembers, parseOrganizationSearch } from './parser';
import type {
  OrganizationDetail,
  OrganizationMembersPage,
  OrganizationSearchFilters,
  OrganizationSearchPage
} from './types';

export const RSI_ORGANIZATIONS_URL = 'https://robertsspaceindustries.com/en/community/orgs/listing';
const RSI_BASE_URL = 'https://robertsspaceindustries.com';
const SEARCH_CACHE_KEY = 'sc-companion.organizations.search.v1';
const DETAIL_CACHE_KEY = 'sc-companion.organizations.details.v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function searchOrganizations(filters: OrganizationSearchFilters, page = 1): Promise<OrganizationSearchPage> {
  const params = new URLSearchParams({ page: String(page), sort: 'size_desc' });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.archetype !== 'all') params.append('model[]', filters.archetype);
  if (filters.commitment !== 'all') params.append('commitment[]', filters.commitment);
  if (filters.recruiting !== 'all') params.append('recruiting[]', filters.recruiting);
  if (filters.rolePlay !== 'all') params.append('roleplay[]', filters.rolePlay);

  const html = await fetchRsiText(`/en/community/orgs/listing?${params}`);
  const result = parseOrganizationSearch(html, page);
  const possibleSid = normalizeSid(filters.search);
  if (page === 1 && possibleSid === filters.search.trim().toUpperCase() && /^[A-Z0-9_-]{2,10}$/.test(possibleSid)) {
    const exactMatch = result.organizations.find((organization) => organization.sid === possibleSid);
    if (!exactMatch) {
      try {
        const detail = await fetchOrganizationDetail(possibleSid);
        result.organizations.unshift(detail);
      } catch {
        // A name search can resemble a Spectrum ID without identifying a real organization.
      }
    } else {
      result.organizations = [exactMatch, ...result.organizations.filter((organization) => organization.sid !== possibleSid)];
    }
  }
  if (page === 1) writeCache(SEARCH_CACHE_KEY, result);
  return result;
}

export async function fetchOrganizationDetail(sid: string): Promise<OrganizationDetail> {
  const normalizedSid = normalizeSid(sid);
  const cached = readDetailsCache()[normalizedSid];
  if (cached && Date.now() - Date.parse(cached.savedAt) < CACHE_MAX_AGE_MS) return cached.detail;

  const html = await fetchRsiText(`/en/orgs/${encodeURIComponent(normalizedSid)}`);
  const detail = parseOrganizationDetail(html, normalizedSid);
  const entries = readDetailsCache();
  entries[normalizedSid] = { savedAt: new Date().toISOString(), detail };
  const trimmed = Object.fromEntries(
    Object.entries(entries)
      .sort(([, left], [, right]) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
      .slice(0, 20)
  );
  writeCache(DETAIL_CACHE_KEY, trimmed);
  return detail;
}

export async function fetchOrganizationMembers(sid: string, page = 1): Promise<OrganizationMembersPage> {
  const html = await fetchRsiText(`/en/orgs/${encodeURIComponent(normalizeSid(sid))}/members?page=${page}`);
  return parseOrganizationMembers(html, page);
}

export function getCachedOrganizationSearch(): OrganizationSearchPage | null {
  return readCache<OrganizationSearchPage>(SEARCH_CACHE_KEY);
}

function normalizeSid(sid: string): string {
  return sid.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

async function fetchRsiText(path: string): Promise<string> {
  const url = `${RSI_BASE_URL}${path}`;
  const response = window.__TAURI_INTERNALS__
    ? await (await import('@tauri-apps/plugin-http')).fetch(url, { method: 'GET' })
    : await window.fetch(`/api/rsi-organizations${path}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error('That public RSI organization could not be found.');
    throw new Error(`RSI organization data returned ${response.status}.`);
  }
  return response.text();
}

interface CachedDetail {
  savedAt: string;
  detail: OrganizationDetail;
}

function readDetailsCache(): Record<string, CachedDetail> {
  return readCache<Record<string, CachedDetail>>(DETAIL_CACHE_KEY) ?? {};
}

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Organization caching is optional.
  }
}
