import type { ShipSummary } from '../ships/types';
import type { CargoAccessMode, TradeTerminal } from './types';

export interface ShipCargoProfile {
  mode: CargoAccessMode;
  label: string;
  description: string;
}

const EXTERNAL_DOCK_SHIPS = new Set(['hull c', 'hull d', 'hull e']);

const STANDARD_PROFILE: ShipCargoProfile = {
  mode: 'standard',
  label: 'Standard cargo access',
  description: 'Uses ordinary hangars, pads, and surface cargo terminals.'
};

const EXTERNAL_DOCK_PROFILE: ShipCargoProfile = {
  mode: 'external-dock',
  label: 'External loading required',
  description: 'Routes are limited to stations with both a docking port and a dedicated external loading dock.'
};

export function getShipCargoProfile(ship: ShipSummary | undefined): ShipCargoProfile {
  if (!ship) return STANDARD_PROFILE;
  return EXTERNAL_DOCK_SHIPS.has(ship.name.trim().toLowerCase()) ? EXTERNAL_DOCK_PROFILE : STANDARD_PROFILE;
}

export function terminalSupportsCargoMode(terminal: TradeTerminal, mode: CargoAccessMode): boolean {
  return mode === 'standard' || (terminal.hasDockingPort && terminal.hasLoadingDock);
}
