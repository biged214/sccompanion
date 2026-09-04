import type { TradeMarketSnapshot } from './types';

const CACHE_KEY = 'sc-companion:trade-market:v6';

export function loadCachedTradeMarket(): TradeMarketSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as TradeMarketSnapshot;
    return snapshot.fetchedAt && Array.isArray(snapshot.terminals) && Array.isArray(snapshot.prices)
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

export function saveCachedTradeMarket(snapshot: TradeMarketSnapshot): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Market data remains available for this run if browser storage is full.
  }
}
