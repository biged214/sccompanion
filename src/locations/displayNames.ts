const LOCATION_ALIASES = new Map<string, string>([
  ['RR ARC LEO', 'Baijini Point'],
  ['ARC LEO', 'Baijini Point'],
  ['RR CRU LEO', 'Seraphim Station'],
  ['CRU LEO', 'Seraphim Station'],
  ['SERAPHIM', 'Seraphim Station'],
  ['RR HUR LEO', 'Everus Harbor'],
  ['HUR LEO', 'Everus Harbor'],
  ['RR MIC LEO', 'Port Tressler'],
  ['MIC LEO', 'Port Tressler'],
  ['GREEN IMPERIAL HOUSING EXCHANGE', 'Grim HEX'],
  ['GRIMHEX', 'Grim HEX'],
  ['MTP NEW BABBAGE', 'New Babbage'],
  ['CBD LORVILLE', 'Lorville'],
  ['LORVILLE L19', 'Lorville']
]);

export function normalizeLocationDisplayName(value: string | null | undefined): string {
  const original = value?.trim();
  if (!original) return '';

  const alias = LOCATION_ALIASES.get(toAliasKey(original));
  if (alias) return alias;

  const lagrange = toAliasKey(original).match(/^RR (ARC|CRU|HUR|MIC) L([1-5])$/);
  if (lagrange) return `${lagrange[1]}-L${lagrange[2]}`;

  return replaceEmbeddedCodes(original);
}

export function firstFriendlyLocationName(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const normalized = normalizeLocationDisplayName(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function replaceEmbeddedCodes(value: string): string {
  return value
    .replace(/RR[\s_-]+ARC[\s_-]+LEO/gi, 'Baijini Point')
    .replace(/RR[\s_-]+CRU[\s_-]+LEO/gi, 'Seraphim Station')
    .replace(/RR[\s_-]+HUR[\s_-]+LEO/gi, 'Everus Harbor')
    .replace(/RR[\s_-]+MIC[\s_-]+LEO/gi, 'Port Tressler')
    .replace(/RR[\s_-]+(ARC|CRU|HUR|MIC)[\s_-]+L([1-5])/gi, (_, body: string, point: string) => `${body.toUpperCase()}-L${point}`);
}

function toAliasKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
