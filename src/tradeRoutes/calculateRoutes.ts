import type { RouteFilters, RouteSort, TradeMarketSnapshot, TradeRoute } from './types';
import { terminalSupportsCargoMode } from './shipCompatibility';

const AUTOLOAD_BASE_COST = 500;
const AUTOLOAD_COST_PER_SCU = 50;
const AUTOLOAD_BASE_SECONDS = 60;
const MANUAL_LOAD_BASE_SECONDS = 60;
const MANUAL_SECONDS_PER_CONTAINER = 30;
const CONTAINER_TRANSFER_SECONDS: Record<number, number> = {
  1: 4,
  2: 6,
  4: 10,
  8: 16,
  16: 32,
  24: 45,
  32: 60
};

export function calculateRoutes(snapshot: TradeMarketSnapshot, filters: RouteFilters, sort: RouteSort): TradeRoute[] {
  if (filters.cargoCapacity <= 0) return [];

  const terminals = new Map(snapshot.terminals.map((terminal) => [terminal.id, terminal]));
  const origins = snapshot.prices.filter((price) => {
    const terminal = terminals.get(price.terminalId);
    return Boolean(
      terminal && price.buyPrice > 0 && price.supply > 0 &&
      matchesTerminal(terminal, filters.originSystemId, filters.originTerminalId, filters.autoloadOnly, filters.cargoAccessMode)
    );
  });
  const destinationsByCommodity = new Map<number, typeof snapshot.prices>();

  snapshot.prices.forEach((price) => {
    const terminal = terminals.get(price.terminalId);
    if (!terminal || price.sellPrice <= 0 || price.demand <= 0) return;
    if (!matchesTerminal(terminal, filters.destinationSystemId, filters.destinationTerminalId, filters.autoloadOnly, filters.cargoAccessMode)) return;
    const group = destinationsByCommodity.get(price.commodityId) ?? [];
    group.push(price);
    destinationsByCommodity.set(price.commodityId, group);
  });

  const routes: TradeRoute[] = [];
  origins.forEach((originPrice) => {
    const origin = terminals.get(originPrice.terminalId);
    if (!origin) return;
    for (const destinationPrice of destinationsByCommodity.get(originPrice.commodityId) ?? []) {
      const destination = terminals.get(destinationPrice.terminalId);
      if (!destination || destination.id === origin.id || destinationPrice.sellPrice <= originPrice.buyPrice) continue;

      const compatibleContainerSizes = intersectContainerSizes(originPrice.containerSizes, destinationPrice.containerSizes);
      if (compatibleContainerSizes.length === 0) continue;

      const affordableScu = calculateAffordableScu(filters.funds, originPrice.buyPrice, filters.autoloadOnly);
      const cargoLimit = Math.floor(Math.min(filters.cargoCapacity, originPrice.supply, destinationPrice.demand, affordableScu));
      const smallestContainer = compatibleContainerSizes[0];
      const cargoScu = Math.floor(cargoLimit / smallestContainer) * smallestContainer;
      if (cargoScu <= 0) continue;

      const commodityCost = cargoScu * originPrice.buyPrice;
      const unitProfit = destinationPrice.sellPrice - originPrice.buyPrice;
      const grossProfit = cargoScu * unitProfit;
      const boxManifest = buildBoxManifest(cargoScu, compatibleContainerSizes);
      const loadingCost = filters.autoloadOnly ? calculateAutoloadCost(cargoScu) : 0;
      const unloadingCost = filters.autoloadOnly ? calculateAutoloadCost(cargoScu) : 0;
      const handlingCost = loadingCost + unloadingCost;
      const loadingSeconds = filters.autoloadOnly ? calculateAutoloadSeconds(boxManifest) : calculateManualHandlingSeconds(boxManifest);
      const unloadingSeconds = filters.autoloadOnly ? calculateAutoloadSeconds(boxManifest) : calculateManualHandlingSeconds(boxManifest);
      const handlingSeconds = loadingSeconds + unloadingSeconds;
      const investment = commodityCost + loadingCost;
      const profit = grossProfit - handlingCost;
      if (profit <= 0) continue;
      routes.push({
        id: `${origin.id}-${destination.id}-${originPrice.commodityId}`,
        commodityId: originPrice.commodityId,
        commodityName: originPrice.commodityName,
        origin,
        destination,
        buyPrice: originPrice.buyPrice,
        sellPrice: destinationPrice.sellPrice,
        unitProfit,
        cargoScu,
        availableSupply: originPrice.supply,
        availableDemand: destinationPrice.demand,
        originContainerSizes: originPrice.containerSizes,
        destinationContainerSizes: destinationPrice.containerSizes,
        compatibleContainerSizes,
        usesAutoload: filters.autoloadOnly,
        boxManifest,
        commodityCost,
        loadingCost,
        unloadingCost,
        handlingCost,
        loadingSeconds,
        unloadingSeconds,
        handlingSeconds,
        investment,
        grossProfit,
        profit,
        roi: investment > 0 ? (profit / investment) * 100 : 0,
        updatedAt: Date.parse(originPrice.updatedAt) < Date.parse(destinationPrice.updatedAt)
          ? originPrice.updatedAt
          : destinationPrice.updatedAt
      });
    }
  });

  return routes.sort((left, right) => {
    if (sort === 'roi') return right.roi - left.roi || right.profit - left.profit;
    if (sort === 'unit-profit') return right.unitProfit - left.unitProfit || right.profit - left.profit;
    if (sort === 'cargo') return right.cargoScu - left.cargoScu || right.profit - left.profit;
    return right.profit - left.profit || right.roi - left.roi;
  });
}

function calculateAffordableScu(funds: number | null, buyPrice: number, usesAutoload: boolean): number {
  if (funds === null) return Number.POSITIVE_INFINITY;
  const availableAfterBaseFee = funds - (usesAutoload ? AUTOLOAD_BASE_COST : 0);
  if (availableAfterBaseFee <= 0) return 0;
  return Math.floor(availableAfterBaseFee / (buyPrice + (usesAutoload ? AUTOLOAD_COST_PER_SCU : 0)));
}

function calculateAutoloadCost(cargoScu: number): number {
  return AUTOLOAD_BASE_COST + cargoScu * AUTOLOAD_COST_PER_SCU;
}

function buildBoxManifest(cargoScu: number, compatibleSizes: number[]): Array<{ size: number; count: number }> {
  let remaining = cargoScu;
  const manifest: Array<{ size: number; count: number }> = [];
  [...compatibleSizes].sort((left, right) => right - left).forEach((size) => {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      manifest.push({ size, count });
      remaining -= count * size;
    }
  });
  return manifest;
}

function calculateAutoloadSeconds(manifest: Array<{ size: number; count: number }>): number {
  return AUTOLOAD_BASE_SECONDS + manifest.reduce(
    (total, box) => total + box.count * (CONTAINER_TRANSFER_SECONDS[box.size] ?? box.size * 4),
    0
  );
}

function calculateManualHandlingSeconds(manifest: Array<{ size: number; count: number }>): number {
  const containerCount = manifest.reduce((total, box) => total + box.count, 0);
  return MANUAL_LOAD_BASE_SECONDS + containerCount * MANUAL_SECONDS_PER_CONTAINER;
}

function intersectContainerSizes(origin: number[], destination: number[]): number[] {
  const destinationSizes = new Set(destination);
  return origin.filter((size) => destinationSizes.has(size));
}

function matchesTerminal(
  terminal: TradeMarketSnapshot['terminals'][number],
  systemId: number | null,
  terminalId: number | null,
  autoloadOnly: boolean,
  cargoAccessMode: RouteFilters['cargoAccessMode']
): boolean {
  return (!systemId || terminal.systemId === systemId) &&
    (!terminalId || terminal.id === terminalId) &&
    (!autoloadOnly || terminal.supportsAutoload) &&
    terminalSupportsCargoMode(terminal, cargoAccessMode);
}
