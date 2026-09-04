import type { PublicRsiProfile } from './types';

const RSI_ORIGIN = 'https://robertsspaceindustries.com';

export function parsePublicRsiProfile(html: string, requestedHandle: string): PublicRsiProfile {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const root = document.querySelector('#public-profile');
  if (!root) throw new Error('RSI did not return a public citizen profile. Check the handle.');

  const profileInfo = root.querySelector('.profile.left-col .info');
  const handle = entryValue(profileInfo, 'Handle name') || requestedHandle;
  const displayName = text(profileInfo?.querySelector('.entry:first-child .value')) || handle;
  const titleEntry = [...(profileInfo?.querySelectorAll('.entry') ?? [])]
    .find((entry) => entry.querySelector('.icon') && !entry.querySelector('.label'));
  const mainOrganizationRoot = root.querySelector('.main-org');
  const organizationLink = mainOrganizationRoot?.querySelector<HTMLAnchorElement>('a.value[href*="/orgs/"]');
  const organizationSid = entryValue(mainOrganizationRoot, 'Spectrum Identification (SID)');

  return {
    handle,
    displayName,
    citizenRecord: text(root.querySelector('.citizen-record .value')) || 'Not public',
    avatarUrl: absoluteUrl(attribute(root.querySelector('.profile.left-col .thumb img'), 'src')),
    title: text(titleEntry?.querySelector('.value')) || 'Not listed',
    enlistedAt: entryValue(root, 'Enlisted') || 'Not public',
    fluency: splitList(entryValue(root, 'Fluency')),
    website: attribute(root.querySelector('.entry.website a'), 'href') ?? '',
    bio: text(root.querySelector('.entry.bio .value')),
    mainOrganization: organizationLink && organizationSid ? {
      name: text(organizationLink),
      sid: organizationSid,
      rank: entryValue(mainOrganizationRoot, 'Organization rank') || 'Not public',
      logoUrl: absoluteUrl(attribute(mainOrganizationRoot?.querySelector('.thumb img'), 'src')),
      url: absoluteUrl(organizationLink.getAttribute('href')) ?? `${RSI_ORIGIN}/en/orgs/${encodeURIComponent(organizationSid)}`
    } : null,
    profileUrl: `${RSI_ORIGIN}/en/citizens/${encodeURIComponent(handle)}`
  };
}

function entryValue(root: Element | null, label: string): string {
  const entry = [...(root?.querySelectorAll('.entry') ?? [])]
    .find((candidate) => text(candidate.querySelector('.label')).toLowerCase() === label.toLowerCase());
  return text(entry?.querySelector('.value'));
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function absoluteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, RSI_ORIGIN).toString();
  } catch {
    return null;
  }
}

function attribute(element: Element | null | undefined, name: string): string | null {
  return element?.getAttribute(name)?.trim() || null;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
