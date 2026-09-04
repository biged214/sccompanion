export interface DataSourceCredit {
  id: string;
  name: string;
  url: string;
  contribution: string;
}

// Register every external data provider here when adding a new integration.
export const DATA_SOURCE_CREDITS: readonly DataSourceCredit[] = [
  {
    id: 'sc-market',
    name: 'SC Market',
    url: 'https://sc-market.space/',
    contribution: 'External player marketplace link; listings are not imported'
  },
  {
    id: 'rsi',
    name: 'Roberts Space Industries / CIG',
    url: 'https://robertsspaceindustries.com/',
    contribution: 'Service status, Spectrum, Comm-Link, public citizen profiles, organizations, and local Game.log data'
  },
  {
    id: 'uex',
    name: 'UEX Corp',
    url: 'https://uexcorp.space/',
    contribution: 'Market prices, player sale listings, locations, ship availability, components, and trade data'
  },
  {
    id: 'star-citizen-wiki',
    name: 'Star Citizen Wiki',
    url: 'https://star-citizen.wiki/',
    contribution: 'Ship and component specifications and media'
  }
] as const;
