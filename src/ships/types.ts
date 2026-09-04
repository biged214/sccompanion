export type ShipKind = 'Ship' | 'Ground Vehicle';

export interface ShipLocationPrice {
  terminal: string;
  location: string;
  price: number;
  updatedAt: string;
}

export interface ShipSummary {
  id: number;
  uuid: string | null;
  slug: string;
  name: string;
  fullName: string;
  manufacturer: string;
  kind: ShipKind;
  roles: string[];
  isConcept: boolean;
  cargoCapacity: number;
  crewMin: number;
  crewMax: number;
  mass: number;
  length: number;
  width: number;
  height: number;
  padType: string | null;
  imageUrl: string | null;
  fallbackImageUrl: string | null;
  pledgeUrl: string | null;
  gameVersion: string;
  purchaseLocations: ShipLocationPrice[];
  rentalLocations: ShipLocationPrice[];
}

export interface ShipTechnicalStat {
  label: string;
  value: string;
}

export interface ShipEquipmentItem {
  name: string;
  type: string;
  control: string | null;
  size: number | null;
  quantity: number;
  manufacturer: string | null;
  details: ShipTechnicalStat[];
}

export interface ShipTurret {
  name: string;
  control: string;
  size: number | null;
  mountCount: number;
  weaponSizes: number[];
  weapons: string[];
  dps: number;
  sustainedDps: number;
  pilotSlaveable: boolean;
}

export interface ShipThrusterGroup {
  type: string;
  count: number;
  capacityMn: number;
  accelerationG: number;
}

export interface ShipDetail {
  uuid: string;
  name: string;
  manufacturer: string;
  description: string;
  career: string;
  role: string;
  productionStatus: string;
  sizeClass: number;
  cargoCapacity: number;
  inventoryCapacity: number;
  crewMin: number;
  crewMax: number;
  mass: number;
  length: number;
  width: number;
  height: number;
  scmSpeed: number;
  maxSpeed: number;
  health: number;
  shieldHp: number;
  armorHealth: number;
  quantumFuelCapacity: number;
  medicalTier: string | null;
  pilotDps: number;
  turretDps: number;
  missileCount: number;
  countermeasureCount: number;
  shieldRegeneration: number;
  shieldFaceType: string | null;
  cargoGridCount: number;
  maxCargoBoxSize: number;
  bedCount: number;
  fuelCapacity: number;
  fuelIntakeRate: number;
  quantumSpeed: number;
  quantumSpoolTime: number;
  quantumRange: number;
  boostForwardSpeed: number;
  boostBackwardSpeed: number;
  pitchRate: number;
  yawRate: number;
  rollRate: number;
  infraredSignature: number;
  electromagneticSignature: number;
  powerSegments: number;
  coolingSegments: number;
  weapons: ShipEquipmentItem[];
  missiles: ShipEquipmentItem[];
  components: ShipEquipmentItem[];
  turrets: ShipTurret[];
  thrusters: ShipThrusterGroup[];
  msrp: number | null;
  pledgeUrl: string | null;
  wikiUrl: string;
  version: string;
}

export interface ShipsSnapshot {
  fetchedAt: string;
  ships: ShipSummary[];
}

export interface ShipsState {
  snapshot: ShipsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
