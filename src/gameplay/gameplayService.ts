import { invoke } from '@tauri-apps/api/core';
import type { GameplayDrilldown, GameplayFilters, GameplayMetric, GameplaySnapshot, TrackerStatus } from './types';

export async function fetchGameplayStatus(): Promise<TrackerStatus> {
  if (!window.__TAURI_INTERNALS__) return previewSnapshot.status;
  return invoke<TrackerStatus>('get_gameplay_status');
}

export async function fetchGameplaySnapshot(filters: GameplayFilters): Promise<GameplaySnapshot> {
  if (!window.__TAURI_INTERNALS__) return filterPreviewSnapshot(filters);
  return invoke<GameplaySnapshot>('get_gameplay_snapshot', {
    sessionId: filters.sessionId,
    category: filters.category === 'all' ? null : filters.category,
    search: filters.search.trim() || null,
    offset: 0,
    limit: filters.limit
  });
}

export async function fetchGameplayDrilldown(metric: GameplayMetric, sessionId: number | null, limit: number, groupKey: string | null = null): Promise<GameplayDrilldown> {
  if (!window.__TAURI_INTERNALS__) return previewDrilldown(metric, sessionId, limit, groupKey);
  return invoke<GameplayDrilldown>('get_gameplay_drilldown', { metric, sessionId, groupKey, limit });
}

export async function autoDetectGameLog(): Promise<string | null> {
  if (!window.__TAURI_INTERNALS__) return 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log';
  return invoke<string | null>('auto_detect_game_log');
}

export async function setGameLogPath(path: string): Promise<void> {
  if (!window.__TAURI_INTERNALS__) return;
  await invoke('set_game_log_path', { path });
}

export async function rescanGameLogs(): Promise<void> {
  if (!window.__TAURI_INTERNALS__) return;
  await invoke('rescan_game_logs');
}

const previewEvents = [
  previewEvent(14, 'Commerce', 'commodity_sale', 'Commodity sale', 'Sold a cargo load at a trade terminal.', { amount: 7114000, quantity: 144, item: 'Processed commodity', location: 'Area18' }, 2),
  previewEvent(13, 'Combat', 'ActorDeath', 'Combat event recorded', 'A tagged combat event was retained from this session.', { location: 'Stanton' }, 1),
  previewEvent(12, 'Missions', 'mission_reward', 'Awarded 243,500 aUEC', 'Contract payout received.', { amount: 243500 }),
  previewEvent(11, 'Missions', 'mission_completed', 'Mission completed', 'Cargo hauling contract completed successfully.'),
  previewEvent(10, 'Cargo', 'FillUnstowRequest', 'Freight elevator transfer', 'Transferred one cargo entity from local inventory.', { quantity: 1, location: 'Distribution Center' }),
  previewEvent(9, 'Commerce', 'commodity_purchase', 'Commodity purchase', 'Purchased 144 SCU through a commodity terminal.', { amount: 5335200, quantity: 144, item: 'Processed commodity', location: 'Shubin Interstellar' }),
  previewEvent(8, 'Vehicles', 'SetVehicleSpawnedInformations', 'Vehicle delivered to hangar', 'ASOP vehicle retrieval completed.', { location: 'Personal Hangar' }),
  previewEvent(7, 'Location', 'location_inventory', 'Location inventory accessed', 'Opened inventory at the current station.', { location: 'Station inventory' }),
  previewEvent(6, 'Commerce', 'item_purchase', 'Purchased ship component', 'Bought one vehicle component from a shop terminal.', { amount: 115330, quantity: 1, item: 'Ball Turret', location: 'CenterMass' }),
  previewEvent(5, 'Missions', 'objective_completed', 'Objective completed', 'Delivery objective marked complete.'),
  previewEvent(4, 'Vehicles', 'CSCItemQuantumDrive::PrepForQT', 'Quantum drive prepared', 'Quantum travel preparation event recorded.'),
  previewEvent(3, 'Connection', 'LoginCompleted', 'Connected to game services', 'Login and shard connection completed.'),
  previewEvent(2, 'Diagnostics', 'ActorStall', 'Actor stall detected', 'A short game-thread stall was logged.'),
  previewEvent(1, 'Other', 'FutureGameplayEvent', 'Future Gameplay Event', 'An unclassified tagged event was retained for later parser support.')
];

const previewSnapshot: GameplaySnapshot = {
  fetchedAt: new Date().toISOString(),
  status: {
    available: true,
    monitoring: true,
    indexing: true,
    logPath: 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
    channel: 'LIVE',
    currentSessionId: 3,
    indexedSessions: 18,
    queuedBackups: 126,
    lastEventAt: new Date().toISOString(),
    lastError: null
  },
  summary: {
    totalSessions: 18,
    totalEvents: 18742,
    gameplayEvents: 2634,
    creditsEarned: 1217500,
    creditsSpent: 6891840,
    missionsCompleted: 7,
    purchases: 19,
    cargoActions: 84,
    locationsVisited: 11,
    disconnects: 2
  },
  categoryCounts: [
    { category: 'Other', count: 12240 }, { category: 'Vehicles', count: 2411 },
    { category: 'Missions', count: 1452 }, { category: 'Cargo', count: 1090 },
    { category: 'Connection', count: 731 }, { category: 'Diagnostics', count: 518 },
    { category: 'Commerce', count: 186 }, { category: 'Location', count: 91 },
    { category: 'Social', count: 17 }, { category: 'Combat', count: 6 }
  ],
  sessions: [
    { id: 3, channel: 'LIVE', build: '12519617', startedAt: new Date(Date.now() - 42 * 60_000).toISOString(), endedAt: null, eventCount: 403, sourceName: 'Game.log', imported: false },
    { id: 2, channel: 'LIVE', build: '12519617', startedAt: new Date(Date.now() - 20 * 60 * 60_000).toISOString(), endedAt: new Date(Date.now() - 18 * 60 * 60_000).toISOString(), eventCount: 4937, sourceName: 'Game Build(12519617).log', imported: true },
    { id: 1, channel: 'LIVE', build: '12519617', startedAt: new Date(Date.now() - 44 * 60 * 60_000).toISOString(), endedAt: new Date(Date.now() - 41 * 60 * 60_000).toISOString(), eventCount: 40602, sourceName: 'Game Build(12519617).log', imported: true }
  ],
  events: previewEvents,
  totalMatchingEvents: previewEvents.length
};

function filterPreviewSnapshot(filters: GameplayFilters): GameplaySnapshot {
  const query = filters.search.trim().toLowerCase();
  const events = previewSnapshot.events
    .filter((event) => filters.sessionId == null || event.sessionId === filters.sessionId)
    .filter((event) => filters.category === 'all' || event.category === filters.category)
    .filter((event) => !query || `${event.title} ${event.summary} ${event.eventType} ${event.item ?? ''} ${event.location ?? ''}`.toLowerCase().includes(query));
  const scopedEvents = filters.sessionId == null ? previewSnapshot.events : previewSnapshot.events.filter((event) => event.sessionId === filters.sessionId);
  const summary = filters.sessionId == null ? previewSnapshot.summary : {
    ...previewSnapshot.summary,
    totalSessions: 1,
    totalEvents: scopedEvents.length,
    gameplayEvents: scopedEvents.filter((event) => !['Other', 'Diagnostics'].includes(event.category)).length,
    creditsEarned: scopedEvents.filter((event) => ['mission_reward', 'item_sale', 'commodity_sale'].includes(event.eventType)).reduce((sum, event) => sum + (event.amount ?? 0), 0),
    creditsSpent: scopedEvents.filter((event) => ['item_purchase', 'commodity_purchase'].includes(event.eventType)).reduce((sum, event) => sum + (event.amount ?? 0), 0),
    missionsCompleted: scopedEvents.filter((event) => event.eventType === 'mission_completed').length,
    purchases: scopedEvents.filter((event) => ['item_purchase', 'commodity_purchase'].includes(event.eventType)).length,
    cargoActions: scopedEvents.filter((event) => event.category === 'Cargo').length,
    locationsVisited: new Set(scopedEvents.map((event) => event.location).filter(Boolean)).size,
    disconnects: scopedEvents.filter((event) => event.eventType.toLowerCase().includes('disconnect')).length
  };
  return { ...previewSnapshot, fetchedAt: new Date().toISOString(), summary, events: events.slice(0, filters.limit), totalMatchingEvents: events.length };
}

function previewEvent(
  id: number,
  category: string,
  eventType: string,
  title: string,
  summary: string,
  fields: Partial<Pick<import('./types').GameEvent, 'amount' | 'quantity' | 'location' | 'item'>> = {},
  sessionId = 3
): import('./types').GameEvent {
  return {
    id,
    sessionId,
    occurredAt: new Date(Date.now() - (12 - id) * 4 * 60_000).toISOString(),
    severity: 'Notice',
    category,
    eventType,
    title,
    summary,
    details: { source: 'Game.log', ...fields },
    rawSanitized: `<2026-08-31T22:01:41.000Z> [Notice] <${eventType}> source[Game.log] sessionId[[redacted]]`,
    amount: fields.amount ?? null,
    quantity: fields.quantity ?? null,
    location: fields.location ?? null,
    item: fields.item ?? null,
    missionId: category === 'Missions' ? `mission-${id}` : null,
    objectiveId: eventType.includes('objective') ? `objective-${id}` : null
  };
}

function previewDrilldown(metric: GameplayMetric, sessionId: number | null, limit: number, selectedGroupKey: string | null): GameplayDrilldown {
  const scoped = previewEvents.filter((event) => sessionId == null || event.sessionId === sessionId);
  const definitions: Record<GameplayMetric, [string, string, (event: import('./types').GameEvent) => boolean, (event: import('./types').GameEvent) => string]> = {
    sessions: ['Captured sessions', 'Every indexed play session, including channel, build, start time, duration, and captured event count.', () => false, () => ''],
    gameplayEvents: ['Gameplay events', 'All classified activity except diagnostic and unclassified records, grouped by category.', (event) => !['Other', 'Diagnostics'].includes(event.category), (event) => event.category],
    creditsEarned: ['Credits earned', 'Mission rewards and recorded item or commodity sales, with individual values and references when available.', (event) => ['mission_reward', 'item_sale', 'commodity_sale'].includes(event.eventType), (event) => event.missionId || event.item || event.title],
    creditsSpent: ['Credits spent', 'Recorded item and commodity purchases, grouped by item with the latest known shop or location.', (event) => ['item_purchase', 'commodity_purchase'].includes(event.eventType), (event) => event.item || event.eventType],
    missionsCompleted: ['Completed missions', 'Mission completion records grouped by mission identifier or the best available log title.', (event) => event.eventType === 'mission_completed', (event) => event.missionId || event.title],
    purchases: ['Purchases', 'Every recorded item and commodity purchase, including quantity, price, item, and location when logged.', (event) => ['item_purchase', 'commodity_purchase'].includes(event.eventType), (event) => event.item || event.eventType],
    cargoActions: ['Cargo actions', 'Cargo, freight elevator, warehouse, and inventory activity grouped by the original event type.', (event) => event.category === 'Cargo', (event) => event.eventType],
    locationsVisited: ['Known locations', 'Every named location found in captured events, with activity count, categories, and most recent occurrence.', (event) => Boolean(event.location), (event) => event.location || 'Unknown']
  };
  const [title, description, matches, groupKey] = definitions[metric];
  if (metric === 'sessions') {
    const sessions = previewSnapshot.sessions.filter((session) => sessionId == null || session.id === sessionId);
    if (selectedGroupKey) {
      const events = previewEvents
        .filter((event) => event.sessionId === Number(selectedGroupKey))
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id - left.id);
      return {
        metric, title: 'Session activity', description: 'Every captured event from the selected session, newest first.',
        totalRecords: events.length, totalAmount: events.reduce((sum, event) => sum + (event.amount ?? 0), 0), groups: [], events: events.slice(0, limit)
      };
    }
    return {
      metric, title, description, totalRecords: sessions.length, totalAmount: 0, events: [],
      groups: sessions
        .map((session) => ({ key: String(session.id), label: `${session.channel}${session.build ? ` · ${session.build}` : ''}`, context: session.startedAt, count: session.eventCount, amount: 0, lastSeen: session.endedAt }))
        .sort((left, right) => groupTimestamp(right) - groupTimestamp(left))
    };
  }
  const events = scoped.filter(matches);
  if (selectedGroupKey) {
    const selectedEvents = events
      .filter((event) => groupKey(event) === selectedGroupKey)
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id - left.id);
    return {
      metric, title: selectedGroupKey, description: 'Matching captured events for the selected activity, newest first.',
      totalRecords: selectedEvents.length,
      totalAmount: selectedEvents.reduce((sum, event) => sum + (event.amount ?? 0), 0),
      groups: [], events: selectedEvents.slice(0, limit)
    };
  }
  const grouped = new Map<string, import('./types').DrilldownGroup>();
  for (const event of events) {
    const key = groupKey(event);
    const current = grouped.get(key) ?? { key, label: key, context: metric === 'locationsVisited' ? event.category : event.location, count: 0, amount: 0, lastSeen: event.occurredAt };
    current.count += 1;
    current.amount += event.amount ?? 0;
    if (!current.lastSeen || Date.parse(event.occurredAt) > Date.parse(current.lastSeen)) {
      current.lastSeen = event.occurredAt;
    }
    grouped.set(key, current);
  }
  const newestEvents = [...events].sort((left, right) =>
    Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || right.id - left.id
  );
  return {
    metric, title, description, totalRecords: events.length,
    totalAmount: events.reduce((sum, event) => sum + (event.amount ?? 0), 0),
    groups: [...grouped.values()].sort((left, right) =>
      groupTimestamp(right) - groupTimestamp(left) || left.label.localeCompare(right.label)
    ),
    events: newestEvents.slice(0, limit)
  };
}

function groupTimestamp(group: import('./types').DrilldownGroup): number {
  const value = group.lastSeen ?? group.context;
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}
