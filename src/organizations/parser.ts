import type {
  OrganizationDetail,
  OrganizationMember,
  OrganizationMembersPage,
  OrganizationSearchPage,
  OrganizationSummary
} from './types';

const RSI_BASE_URL = 'https://robertsspaceindustries.com';

export function parseOrganizationSearch(html: string, page: number): OrganizationSearchPage {
  const document = parseDocument(html);
  const organizations = [...document.querySelectorAll('#orgs-search-listing .org-cell')]
    .map(parseSearchCard)
    .filter((organization): organization is OrganizationSummary => Boolean(organization));

  return {
    fetchedAt: new Date().toISOString(),
    page,
    organizations,
    hasMore: organizations.length >= 30
  };
}

export function parseOrganizationDetail(html: string, sid: string): OrganizationDetail {
  const document = parseDocument(html);
  const root = document.querySelector('#organization.public');
  const heading = root?.querySelector('.heading');
  const symbol = text(heading?.querySelector('h1 .symbol')) || sid.toUpperCase();
  const fullHeading = text(heading?.querySelector('h1'));
  const name = fullHeading.replace(new RegExp(`\\s*/?\\s*${escapeRegExp(symbol)}\\s*$`, 'i'), '').trim();
  const countText = text(heading?.querySelector('.logo .count'));
  const tags = [...(heading?.querySelectorAll('.tags li') ?? [])];
  const activityImages = [...(heading?.querySelectorAll('.focus img[alt]') ?? [])];

  if (!root || !name) throw new Error('RSI did not return a public organization profile. Check the Spectrum ID.');

  return {
    sid: symbol,
    name,
    logoUrl: absoluteUrl(attribute(heading?.querySelector('.logo img'), 'src')),
    bannerUrl: absoluteUrl(attribute(heading?.querySelector('.banner img'), 'src')),
    coverUrl: absoluteUrl(attribute(root.querySelector('.content.block.cover img'), 'src')),
    archetype: text(tags.find((item) => item.classList.contains('model'))) || 'Organization',
    language: '',
    commitment: text(tags.find((item) => item.classList.contains('commitment'))) || 'Not listed',
    recruiting: root.querySelector('.bt-join') ? true : null,
    rolePlay: tagBoolean(tags, 'roleplay'),
    memberCount: integer(countText),
    activities: activityImages.map((image) => image.getAttribute('alt')?.trim() ?? '').filter(Boolean),
    description: structuredText(root.querySelector('.content.join-us .body.markitup-text')),
    history: structuredText(root.querySelector('#tab-history .markitup-text')),
    manifesto: structuredText(root.querySelector('#tab-manifesto .markitup-text')),
    charter: structuredText(root.querySelector('#tab-charter .markitup-text')),
    url: `${RSI_BASE_URL}/en/orgs/${encodeURIComponent(symbol)}`
  };
}

export function parseOrganizationMembers(html: string, page: number): OrganizationMembersPage {
  const document = parseDocument(html);
  const members = [...document.querySelectorAll('#members-data .member-item')]
    .map(parseMember)
    .filter((member): member is OrganizationMember => Boolean(member));

  return { page, members, hasMore: members.length > 0 };
}

function parseSearchCard(card: Element): OrganizationSummary | null {
  const link = card.querySelector('a[href*="/orgs/"]');
  const sid = text(card.querySelector('.symbol')).toUpperCase();
  const name = text(card.querySelector('.name'));
  if (!link || !sid || !name) return null;

  const values = new Map<string, string>();
  card.querySelectorAll('.infoitem').forEach((item) => {
    const label = text(item.querySelector('.label')).replace(/:\s*$/, '').toLowerCase();
    values.set(label, text(item.querySelector('.value')));
  });

  return {
    sid,
    name,
    logoUrl: absoluteUrl(attribute(card.querySelector('.thumb img'), 'src')),
    archetype: values.get('archetype') || 'Organization',
    language: values.get('lang') || 'Not listed',
    commitment: values.get('commitment') || 'Not listed',
    recruiting: yesNo(values.get('recruiting')),
    rolePlay: yesNo(values.get('role play')),
    memberCount: integer(values.get('members') || ''),
    url: absoluteUrl(link.getAttribute('href')) || `${RSI_BASE_URL}/en/orgs/${encodeURIComponent(sid)}`
  };
}

function parseMember(item: Element): OrganizationMember | null {
  const link = item.querySelector<HTMLAnchorElement>('a.membercard[href*="/citizens/"]');
  if (!link) return null;
  const handle = decodeURIComponent(link.getAttribute('href')?.split('/citizens/')[1]?.split(/[?#]/)[0] ?? '').trim();
  if (!handle) return null;
  const roleList = [...item.querySelectorAll('.rolelist li')].map(text).filter(Boolean);
  const title = text(item.querySelector('.roles .title'));

  return {
    handle,
    avatarUrl: absoluteUrl(attribute(item.querySelector('.thumb img'), 'src')),
    rank: text(item.querySelector('.rank')) || 'Not public',
    roles: roleList,
    affiliation: item.classList.contains('org-main') && title.toLowerCase() !== 'affiliate' ? 'Main' : 'Affiliate',
    profileUrl: absoluteUrl(link.getAttribute('href')) || `${RSI_BASE_URL}/en/citizens/${encodeURIComponent(handle)}`
  };
}

function parseDocument(html: string): Document {
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (document.querySelector('parsererror')) throw new Error('RSI returned unreadable organization data.');
  return document;
}

function structuredText(element: Element | null): string {
  if (!element) return '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, iframe, form').forEach((node) => node.remove());
  clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  clone.querySelectorAll('p, h1, h2, h3, h4, li, blockquote').forEach((node) => node.append('\n'));
  return (clone.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function tagBoolean(tags: Element[], className: string): boolean | null {
  const tag = tags.find((item) => item.classList.contains(className));
  if (!tag) return null;
  return !/no|false/i.test(text(tag));
}

function yesNo(value?: string): boolean | null {
  if (!value) return null;
  if (/^yes$/i.test(value)) return true;
  if (/^no$/i.test(value)) return false;
  return null;
}

function integer(value: string): number {
  const parsed = Number(value.replace(/[^0-9]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function attribute(element: Element | null | undefined, name: string): string | null {
  return element?.getAttribute(name)?.trim() || null;
}

function absoluteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, RSI_BASE_URL).toString();
  } catch {
    return null;
  }
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
