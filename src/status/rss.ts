import type { CurrentServiceStatus, ServiceLevel, StatusSnapshot, StatusUpdate } from './types';

const MAX_RECENT_UPDATES = 100;

export function parseStatusFeed(xmlText: string, fetchedAt = new Date().toISOString()): StatusSnapshot {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const parserError = doc.querySelector('parsererror');

  if (parserError) {
    throw new Error('The RSI status feed returned invalid XML.');
  }

  const channel = doc.querySelector('channel');
  if (!channel) {
    throw new Error('The RSI status feed did not include an RSS channel.');
  }

  const updates = Array.from(channel.querySelectorAll('item')).slice(0, MAX_RECENT_UPDATES).map(parseItem);

  return {
    feedTitle: readText(channel, 'title') || 'RSI Status',
    feedDescription: readText(channel, 'description') || 'Latest Robert Space Industries service updates.',
    fetchedAt,
    updates
  };
}

export function parseCurrentStatusPage(html: string): CurrentServiceStatus {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const summary = doc.querySelector<HTMLElement>('.summary[data-status]');

  if (!summary) {
    throw new Error('The RSI status page did not include a current service summary.');
  }

  const services = Array.from(doc.querySelectorAll<HTMLElement>('.component')).map((component) => {
    const status = component.querySelector<HTMLElement>('.component-status[data-status]');
    const nameContainer = component.cloneNode(true) as HTMLElement;
    nameContainer.querySelector('.component-status')?.remove();

    return {
      name: nameContainer.textContent?.trim() || 'RSI Service',
      level: normalizeCurrentLevel(status?.dataset.status),
      label: status?.textContent?.trim() || 'Unknown'
    };
  });

  return {
    level: normalizeCurrentLevel(summary.dataset.status),
    message: summary.childNodes[0]?.textContent?.trim() || summary.textContent?.trim() || 'Status Unknown',
    services
  };
}

function normalizeCurrentLevel(value: string | undefined): ServiceLevel {
  if (value === 'operational' || value === 'maintenance' || value === 'degraded') {
    return value;
  }
  if (value === 'major') {
    return 'outage';
  }
  if (value === 'partial') {
    return 'degraded';
  }
  return 'unknown';
}

function parseItem(item: Element): StatusUpdate {
  const title = readText(item, 'title') || 'Untitled status update';
  const description = cleanDescription(readText(item, 'description'));
  const publishedAt = parseDate(readText(item, 'pubDate'));
  const link = readText(item, 'link');
  const guid = readText(item, 'guid');
  const category = readText(item, 'category') || inferCategory(title);

  return {
    id: guid || link || `${title}-${publishedAt}`,
    title,
    description,
    publishedAt,
    link,
    category,
    level: inferServiceLevel(`${title} ${description}`)
  };
}

function readText(parent: Element, selector: string): string {
  return parent.querySelector(selector)?.textContent?.trim() ?? '';
}

function parseDate(value: string): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanDescription(value: string): string {
  const doc = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  doc.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  doc.querySelectorAll('p, div, h1, h2, h3, h4, li').forEach((element) => {
    element.append('\n');
  });

  return (doc.body.textContent ?? value)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+(\[\d{4}-\d{2}-\d{2} Updates\])/gi, '\n\n$1')
    .replace(/\s+(\d{4}\s+UTC\s+-)/gi, '\n$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inferCategory(title: string): string {
  const normalized = title.toLowerCase();

  if (normalized.includes('persistent universe') || normalized.includes('pu')) {
    return 'Persistent Universe';
  }

  if (normalized.includes('platform') || normalized.includes('website')) {
    return 'RSI Platform';
  }

  if (normalized.includes('maintenance')) {
    return 'Maintenance';
  }

  return 'Service Update';
}

function inferServiceLevel(value: string): ServiceLevel {
  const normalized = value.toLowerCase();

  if (/(outage|offline|unavailable|down|major incident)/.test(normalized)) {
    return 'outage';
  }

  if (/(maintenance|scheduled|deployment|downtime)/.test(normalized)) {
    return 'maintenance';
  }

  if (/(degraded|delay|disruption|issue|investigating|partial)/.test(normalized)) {
    return 'degraded';
  }

  if (/(resolved|operational|online|normal)/.test(normalized)) {
    return 'operational';
  }

  return 'unknown';
}
