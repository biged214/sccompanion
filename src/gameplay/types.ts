export type GameplayCategory = 'Missions' | 'Commerce' | 'Cargo' | 'Location' | 'Vehicles' | 'Combat' | 'Connection' | 'Social' | 'Diagnostics' | 'Other';

export interface TrackerStatus {
  available: boolean;
  monitoring: boolean;
  indexing: boolean;
  logPath: string | null;
  channel: string | null;
  currentSessionId: number | null;
  indexedSessions: number;
  queuedBackups: number;
  lastEventAt: string | null;
  lastError: string | null;
}

export interface GameplaySummary {
  totalSessions: number;
  totalEvents: number;
  gameplayEvents: number;
  creditsEarned: number;
  creditsSpent: number;
  missionsCompleted: number;
  purchases: number;
  cargoActions: number;
  locationsVisited: number;
  disconnects: number;
}

export interface GameplayCategoryCount {
  category: string;
  count: number;
}

export interface GameSession {
  id: number;
  channel: string;
  build: string | null;
  startedAt: string;
  endedAt: string | null;
  eventCount: number;
  sourceName: string;
  imported: boolean;
}

export interface GameEvent {
  id: number;
  sessionId: number;
  occurredAt: string;
  severity: string;
  category: string;
  eventType: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  rawSanitized: string;
  amount: number | null;
  quantity: number | null;
  location: string | null;
  item: string | null;
  missionId: string | null;
  objectiveId: string | null;
}

export interface GameplaySnapshot {
  fetchedAt: string;
  status: TrackerStatus;
  summary: GameplaySummary;
  categoryCounts: GameplayCategoryCount[];
  sessions: GameSession[];
  events: GameEvent[];
  totalMatchingEvents: number;
}

export interface GameplayFilters {
  sessionId: number | null;
  category: string;
  search: string;
  limit: number;
}

export type GameplayMetric = 'sessions' | 'gameplayEvents' | 'creditsEarned' | 'creditsSpent' | 'missionsCompleted' | 'purchases' | 'cargoActions' | 'locationsVisited';

export interface DrilldownGroup {
  key: string;
  label: string;
  context: string | null;
  count: number;
  amount: number;
  lastSeen: string | null;
}

export interface GameplayDrilldown {
  metric: GameplayMetric;
  title: string;
  description: string;
  totalRecords: number;
  totalAmount: number;
  groups: DrilldownGroup[];
  events: GameEvent[];
}
