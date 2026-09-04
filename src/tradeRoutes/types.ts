export interface TradeTerminal {
  id: number;
  name: string;
  systemId: number;
  systemName: string;
  location: string;
  supportsAutoload: boolean;
  hasDockingPort: boolean;
  hasLoadingDock: boolean;
  hasFreightElevator: boolean;
  maxContainerSize: number;
}

export type CargoAccessMode = 'standard' | 'external-dock';

export interface CommodityPrice {
  commodityId: number;
  commodityName: string;
  terminalId: number;
  buyPrice: number;
  sellPrice: number;
  supply: number;
  demand: number;
  containerSizes: number[];
  updatedAt: string;
}

export interface TradeMarketSnapshot {
  fetchedAt: string;
  systems: Array<{ id: number; name: string }>;
  terminals: TradeTerminal[];
  prices: CommodityPrice[];
}

export interface TradeRoute {
  id: string;
  commodityId: number;
  commodityName: string;
  origin: TradeTerminal;
  destination: TradeTerminal;
  buyPrice: number;
  sellPrice: number;
  unitProfit: number;
  cargoScu: number;
  availableSupply: number;
  availableDemand: number;
  originContainerSizes: number[];
  destinationContainerSizes: number[];
  compatibleContainerSizes: number[];
  usesAutoload: boolean;
  boxManifest: Array<{ size: number; count: number }>;
  commodityCost: number;
  loadingCost: number;
  unloadingCost: number;
  handlingCost: number;
  loadingSeconds: number;
  unloadingSeconds: number;
  handlingSeconds: number;
  investment: number;
  grossProfit: number;
  profit: number;
  roi: number;
  updatedAt: string;
}

export interface RouteFilters {
  cargoCapacity: number;
  funds: number | null;
  originSystemId: number | null;
  destinationSystemId: number | null;
  originTerminalId: number | null;
  destinationTerminalId: number | null;
  autoloadOnly: boolean;
  cargoAccessMode: CargoAccessMode;
}

export type RouteSort = 'profit' | 'roi' | 'unit-profit' | 'cargo';

export interface TradeRoutesState {
  snapshot: TradeMarketSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
