export interface ComponentLocationPrice {
  terminal: string;
  location: string;
  price: number;
  updatedAt: string;
}

export interface ComponentSummary {
  id: number;
  uuid: string | null;
  name: string;
  manufacturer: string;
  section: string;
  category: string;
  size: string;
  gameVersion: string;
  purchaseLocations: ComponentLocationPrice[];
}

export interface ComponentSpec {
  label: string;
  value: string;
}

export interface ComponentDetail {
  uuid: string;
  name: string;
  manufacturer: string;
  description: string;
  type: string;
  subType: string;
  size: number;
  grade: string;
  itemClass: string;
  mass: number;
  health: number;
  repairable: boolean | null;
  imageUrl: string | null;
  wikiUrl: string;
  version: string;
  specifications: ComponentSpec[];
}

export interface ComponentsSnapshot {
  fetchedAt: string;
  components: ComponentSummary[];
}

export interface ComponentsState {
  snapshot: ComponentsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
