import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Crosshair,
  Database,
  FolderSearch,
  Gauge,
  History,
  MapPin,
  PackageOpen,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings2,
  ShoppingCart,
  Terminal,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePersistentState } from '../state/usePersistentState';
import { autoDetectGameLog, fetchGameplayDrilldown, rescanGameLogs, setGameLogPath } from './gameplayService';
import type { DrilldownGroup, GameEvent, GameSession, GameplayDrilldown, GameplayFilters, GameplayMetric, GameplaySnapshot, TrackerStatus } from './types';
import { useGameplay } from './useGameplay';

type SessionMode = 'live' | 'all' | 'session';

export function GameplayBrowser({ overview }: { overview: TrackerStatus | null }) {
  const [mode, setMode] = usePersistentState<SessionMode>('gameplay.mode', 'live');
  const [selectedSessionId, setSelectedSessionId] = usePersistentState<number | null>('gameplay.session', null);
  const [category, setCategory] = usePersistentState('gameplay.category', 'all');
  const [search, setSearch] = usePersistentState('gameplay.search', '');
  const [limit, setLimit] = usePersistentState('gameplay.limit', 100);
  const [pathEditorOpen, setPathEditorOpen] = useState(false);
  const [pathValue, setPathValue] = useState(overview?.logPath ?? '');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [detailMetric, setDetailMetric] = useState<GameplayMetric | null>(null);
  const [drilldown, setDrilldown] = useState<GameplayDrilldown | null>(null);
  const [detailLimit, setDetailLimit] = useState(100);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DrilldownGroup | null>(null);
  const [groupDrilldown, setGroupDrilldown] = useState<GameplayDrilldown | null>(null);
  const [groupLimit, setGroupLimit] = useState(100);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const filtersMounted = useRef(false);

  const effectiveSessionId = mode === 'live'
    ? overview?.currentSessionId ?? null
    : mode === 'session' ? selectedSessionId : null;
  const filters: GameplayFilters = { sessionId: effectiveSessionId, category, search, limit };
  const gameplay = useGameplay(filters);
  const snapshot = gameplay.snapshot;
  const trackerStatus = snapshot?.status ?? overview;

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setLimit(100);
  }, [category, effectiveSessionId, search, setLimit]);
  useEffect(() => {
    if (overview?.logPath) setPathValue(overview.logPath);
  }, [overview?.logPath]);
  useEffect(() => {
    if (!detailMetric) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void fetchGameplayDrilldown(detailMetric, effectiveSessionId, detailLimit)
      .then((result) => { if (!cancelled) setDrilldown(result); })
      .catch((reason) => { if (!cancelled) setDetailError(reason instanceof Error ? reason.message : 'Could not load these details.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [detailLimit, detailMetric, effectiveSessionId]);
  useEffect(() => {
    if (!detailMetric || !selectedGroup) return;
    let cancelled = false;
    setGroupLoading(true);
    setGroupError(null);
    void fetchGameplayDrilldown(detailMetric, effectiveSessionId, groupLimit, selectedGroup.key)
      .then((result) => { if (!cancelled) setGroupDrilldown(result); })
      .catch((reason) => { if (!cancelled) setGroupError(reason instanceof Error ? reason.message : 'Could not load this activity.'); })
      .finally(() => { if (!cancelled) setGroupLoading(false); });
    return () => { cancelled = true; };
  }, [detailMetric, effectiveSessionId, groupLimit, selectedGroup]);

  const selectedSession = useMemo(
    () => snapshot?.sessions.find((session) => session.id === effectiveSessionId) ?? null,
    [effectiveSessionId, snapshot?.sessions]
  );

  async function runAction(action: () => Promise<unknown>) {
    setActionPending(true);
    setActionError(null);
    try {
      await action();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      await gameplay.refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The log tracker could not complete that action.');
    } finally {
      setActionPending(false);
    }
  }

  function openSession(session: GameSession) {
    setSelectedSessionId(session.id);
    setMode('session');
    setCategory('all');
    setSearch('');
    setDetailMetric(null);
  }

  function openMetric(metric: GameplayMetric) {
    setDetailLimit(100);
    setDrilldown(null);
    setSelectedGroup(null);
    setGroupDrilldown(null);
    setDetailMetric(metric);
  }

  function selectGroup(group: DrilldownGroup) {
    if (selectedGroup?.key === group.key) {
      setSelectedGroup(null);
      setGroupDrilldown(null);
      return;
    }
    setSelectedGroup(group);
    setGroupDrilldown(null);
    setGroupLimit(100);
  }

  return (
    <section className="gameplay-section">
      <div className="section-heading gameplay-heading">
        <div><p className="eyebrow">Local Gameplay History</p><h2>Live Sessions</h2></div>
        <p>{formatNumber(trackerStatus?.indexedSessions ?? 0)} captured sessions</p>
      </div>

      <TrackerBanner
        status={trackerStatus}
        pending={actionPending}
        editorOpen={pathEditorOpen}
        pathValue={pathValue}
        error={actionError || gameplay.error}
        onToggleEditor={() => setPathEditorOpen((open) => !open)}
        onPathChange={setPathValue}
        onDetect={() => void runAction(async () => {
          const detected = await autoDetectGameLog();
          if (!detected) throw new Error('No LIVE, PTU, or EPTU Game.log was found automatically.');
          setPathValue(detected);
        })}
        onSave={() => void runAction(() => setGameLogPath(pathValue))}
        onRescan={() => void runAction(rescanGameLogs)}
      />

      <div className="gameplay-viewbar">
        <div className="gameplay-mode" role="tablist" aria-label="Session scope">
          <button type="button" role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'active' : ''} onClick={() => setMode('live')}>
            <Radio size={16} aria-hidden="true" /> Live session
          </button>
          <button type="button" role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
            <Database size={16} aria-hidden="true" /> All sessions
          </button>
          {mode === 'session' && selectedSession && (
            <button type="button" role="tab" aria-selected="true" className="active">
              <History size={16} aria-hidden="true" /> {formatSessionLabel(selectedSession)}
            </button>
          )}
        </div>
        <span className="gameplay-scope-label">
          {mode === 'live' ? 'Following the current Game.log' : mode === 'all' ? 'Combined lifetime totals' : 'Viewing one archived session'}
        </span>
      </div>

      {snapshot && <SummaryGrid snapshot={snapshot} activeMetric={detailMetric} onSelect={openMetric} />}

      {detailMetric && (
        <DrilldownPanel
          data={drilldown}
          loading={detailLoading}
          error={detailError}
          limit={detailLimit}
          selectedGroup={selectedGroup}
          groupData={groupDrilldown}
          groupLoading={groupLoading}
          groupError={groupError}
          groupLimit={groupLimit}
          onSelectGroup={selectGroup}
          onClearGroup={() => { setSelectedGroup(null); setGroupDrilldown(null); }}
          onLoadMoreGroup={() => setGroupLimit((current) => Math.min(current + 100, 500))}
          onLoadMore={() => setDetailLimit((current) => Math.min(current + 100, 500))}
          onClose={() => { setDetailMetric(null); setSelectedGroup(null); setGroupDrilldown(null); }}
        />
      )}

      <div className="gameplay-layout">
        <div className="gameplay-main">
          <header className="timeline-heading">
            <div><p className="eyebrow">Event Stream</p><h3>{mode === 'all' ? 'All captured events' : selectedSession ? formatSessionLabel(selectedSession) : 'Current session'}</h3></div>
            <span>{snapshot?.totalMatchingEvents.toLocaleString() ?? 0} matching</span>
          </header>

          <section className="gameplay-filters" aria-label="Gameplay event filters">
            <label className="gameplay-search">
              <Search size={17} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events, items, or locations" />
            </label>
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All event categories</option>
                {(snapshot?.categoryCounts ?? []).map((entry) => <option key={entry.category} value={entry.category}>{entry.category} ({entry.count.toLocaleString()})</option>)}
              </select>
            </label>
            <button type="button" className="icon-button" title="Refresh events" aria-label="Refresh gameplay events" onClick={() => void gameplay.refresh()} disabled={gameplay.isLoading}>
              <RefreshCw size={18} className={gameplay.isLoading ? 'spin' : undefined} aria-hidden="true" />
            </button>
          </section>

          <div className="gameplay-timeline">
            {(snapshot?.events ?? []).map((event) => <EventRow key={event.id} event={event} />)}
          </div>

          {!gameplay.isLoading && snapshot?.events.length === 0 && (
            <section className="notice gameplay-empty">
              <Activity size={19} aria-hidden="true" />
              <div><strong>No matching events</strong><span>The tracker is still capturing data. Adjust the filters or select another session.</span></div>
            </section>
          )}

          {snapshot && snapshot.events.length < snapshot.totalMatchingEvents && (
            <div className="load-more">
              <button type="button" onClick={() => setLimit((current) => Math.min(current + 100, 500))} disabled={limit >= 500}>
                <ArrowRight size={17} aria-hidden="true" />
                {limit >= 500 ? 'Refine filters to see more' : 'Load more events'}
              </button>
            </div>
          )}
        </div>

        <SessionHistory
          sessions={snapshot?.sessions ?? []}
          activeSessionId={effectiveSessionId}
          currentSessionId={snapshot?.status.currentSessionId ?? null}
          onSelect={openSession}
        />
      </div>
    </section>
  );
}

function TrackerBanner({
  status,
  pending,
  editorOpen,
  pathValue,
  error,
  onToggleEditor,
  onPathChange,
  onDetect,
  onSave,
  onRescan
}: {
  status: TrackerStatus | null;
  pending: boolean;
  editorOpen: boolean;
  pathValue: string;
  error: string | null;
  onToggleEditor: () => void;
  onPathChange: (value: string) => void;
  onDetect: () => void;
  onSave: () => void;
  onRescan: () => void;
}) {
  return (
    <section className={`tracker-banner ${status?.available ? 'tracker-banner--online' : 'tracker-banner--offline'}`}>
      <div className="tracker-banner__status">
        <span className="tracker-signal" aria-hidden="true"><span /></span>
        <div>
          <strong>{status?.monitoring ? 'Game log monitoring active' : 'Game log not connected'}</strong>
          <span>{status?.logPath || 'SC Companion could not locate Game.log.'}</span>
        </div>
      </div>
      <div className="tracker-banner__meta">
        {status?.indexing && <span><RefreshCw size={15} className="spin" aria-hidden="true" /> Indexing {status.queuedBackups} older logs</span>}
        <span><Database size={15} aria-hidden="true" /> {status?.indexedSessions ?? 0} sessions indexed</span>
      </div>
      <div className="tracker-banner__actions">
        <button type="button" className="icon-button" title="Log location" aria-label="Configure game log location" onClick={onToggleEditor}><Settings2 size={18} /></button>
        <button type="button" className="refresh-button" onClick={onRescan} disabled={pending}><RefreshCw size={16} className={pending ? 'spin' : undefined} /> Re-index</button>
      </div>
      {editorOpen && (
        <div className="tracker-path-editor">
          <label><span>Game.log or channel folder</span><input value={pathValue} onChange={(event) => onPathChange(event.target.value)} /></label>
          <button type="button" className="secondary-button" onClick={onDetect} disabled={pending}><FolderSearch size={16} /> Auto-detect</button>
          <button type="button" className="refresh-button" onClick={onSave} disabled={pending}>Save path</button>
        </div>
      )}
      {error && <div className="tracker-banner__error"><AlertTriangle size={16} /> {error}</div>}
    </section>
  );
}

function SummaryGrid({ snapshot, activeMetric, onSelect }: { snapshot: GameplaySnapshot; activeMetric: GameplayMetric | null; onSelect: (metric: GameplayMetric) => void }) {
  const summary = snapshot.summary;
  const stats = [
    { metric: 'sessions' as const, label: 'Sessions', value: formatNumber(summary.totalSessions), icon: <History size={19} /> },
    { metric: 'gameplayEvents' as const, label: 'Gameplay events', value: formatNumber(summary.gameplayEvents), icon: <Activity size={19} /> },
    { metric: 'creditsEarned' as const, label: 'Credits earned', value: `${formatCompactCurrency(summary.creditsEarned)} aUEC`, icon: <CircleDollarSign size={19} />, tone: 'positive' },
    { metric: 'creditsSpent' as const, label: 'Credits spent', value: `${formatCompactCurrency(summary.creditsSpent)} aUEC`, icon: <ShoppingCart size={19} /> },
    { metric: 'missionsCompleted' as const, label: 'Missions complete', value: formatNumber(summary.missionsCompleted), icon: <CheckCircle2 size={19} /> },
    { metric: 'purchases' as const, label: 'Purchases', value: formatNumber(summary.purchases), icon: <PackageOpen size={19} /> },
    { metric: 'cargoActions' as const, label: 'Cargo actions', value: formatNumber(summary.cargoActions), icon: <Box size={19} /> },
    { metric: 'locationsVisited' as const, label: 'Known locations', value: formatNumber(summary.locationsVisited), icon: <MapPin size={19} /> }
  ];
  return <div className="gameplay-summary">{stats.map((stat) => (
    <button type="button" className={`gameplay-stat ${stat.tone ? `gameplay-stat--${stat.tone}` : ''} ${activeMetric === stat.metric ? 'active' : ''}`} key={stat.label} onClick={() => onSelect(stat.metric)} aria-pressed={activeMetric === stat.metric}>
      <span>{stat.icon}</span><div><small>{stat.label}</small><strong>{stat.value}</strong></div><ChevronRight size={16} aria-hidden="true" />
    </button>
  ))}</div>;
}

function DrilldownPanel({
  data,
  loading,
  error,
  limit,
  selectedGroup,
  groupData,
  groupLoading,
  groupError,
  groupLimit,
  onSelectGroup,
  onClearGroup,
  onLoadMoreGroup,
  onLoadMore,
  onClose
}: {
  data: GameplayDrilldown | null;
  loading: boolean;
  error: string | null;
  limit: number;
  selectedGroup: DrilldownGroup | null;
  groupData: GameplayDrilldown | null;
  groupLoading: boolean;
  groupError: string | null;
  groupLimit: number;
  onSelectGroup: (group: DrilldownGroup) => void;
  onClearGroup: () => void;
  onLoadMoreGroup: () => void;
  onLoadMore: () => void;
  onClose: () => void;
}) {
  return (
    <section className="gameplay-drilldown" aria-live="polite">
      <header>
        <div>
          <p className="eyebrow">Detailed Breakdown</p>
          <h3>{data?.title ?? 'Loading details'}</h3>
          {data && <p>{data.description}</p>}
        </div>
        <button type="button" className="icon-button" title="Close details" aria-label="Close details" onClick={onClose}><X size={18} /></button>
      </header>
      {loading && !data && <div className="gameplay-drilldown__loading"><RefreshCw size={18} className="spin" /> Reading full session history...</div>}
      {error && <div className="tracker-banner__error"><AlertTriangle size={16} /> {error}</div>}
      {data && (
        <>
          <div className="gameplay-drilldown__totals">
            <div><span>Source records</span><strong>{formatNumber(data.totalRecords)}</strong></div>
            <div><span>Grouped results</span><strong>{formatNumber(data.groups.length)}</strong></div>
            {['creditsEarned', 'creditsSpent', 'purchases'].includes(data.metric) && data.totalAmount > 0 && <div><span>Recorded value</span><strong>{formatCurrency(data.totalAmount)} aUEC</strong></div>}
          </div>
          <div className="gameplay-drilldown__groups">
            <div className="gameplay-drilldown__group gameplay-drilldown__group--heading"><span>Result</span><span>Activity</span><span>{data.metric === 'sessions' ? 'Ended / duration' : 'Last seen'}</span></div>
            {data.groups.map((group, index) => (
              <button type="button" className={`gameplay-drilldown__group ${selectedGroup?.key === group.key ? 'active' : ''}`} key={`${group.key}-${index}`} onClick={() => onSelectGroup(group)} aria-pressed={selectedGroup?.key === group.key}>
                <div><strong>{humanizeIdentifier(group.label)}</strong>{group.context && <span>{formatDrilldownContext(group.context)}</span>}</div>
                <div><strong>{formatNumber(group.count)}</strong>{group.amount > 0 && <span>{formatCurrency(group.amount)} aUEC</span>}</div>
                <span className="gameplay-drilldown__last"><time dateTime={group.lastSeen ?? undefined}>{data.metric === 'sessions' ? formatSessionEnding(group.context, group.lastSeen) : group.lastSeen ? formatSessionDate(group.lastSeen) : '—'}</time><ChevronRight size={16} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
          {selectedGroup && (
            <section className="gameplay-group-detail">
              <header>
                <div><p className="eyebrow">Selected Activity</p><h3>{humanizeIdentifier(selectedGroup.label)}</h3><span>Individual matching records, newest first. Select a record to see every captured field.</span></div>
                <button type="button" className="icon-button" title="Close selected activity" aria-label="Close selected activity" onClick={onClearGroup}><X size={17} /></button>
              </header>
              {groupLoading && !groupData && <div className="gameplay-drilldown__loading"><RefreshCw size={18} className="spin" /> Loading activity details...</div>}
              {groupError && <div className="tracker-banner__error"><AlertTriangle size={16} /> {groupError}</div>}
              {groupData && (
                <>
                  <div className="gameplay-group-detail__totals">
                    <div><span>Matching records</span><strong>{formatNumber(groupData.totalRecords)}</strong></div>
                    {groupData.totalAmount > 0 && <div><span>Recorded value</span><strong>{formatCurrency(groupData.totalAmount)} aUEC</strong></div>}
                    <div><span>Loaded</span><strong>{formatNumber(groupData.events.length)}</strong></div>
                  </div>
                  <div className="gameplay-timeline">{groupData.events.map((event) => <EventRow key={`group-${event.id}`} event={event} />)}</div>
                  {groupData.events.length === 0 && !groupLoading && <div className="gameplay-drilldown__loading">No source records were available for this activity.</div>}
                  {groupData.events.length < groupData.totalRecords && groupLimit < 500 && <div className="load-more"><button type="button" onClick={onLoadMoreGroup}><ArrowRight size={17} /> Load more records</button></div>}
                </>
              )}
            </section>
          )}
          {!selectedGroup && data.events.length > 0 && (
            <div className="gameplay-drilldown__records">
              <div className="timeline-heading"><div><p className="eyebrow">Underlying Records</p><h3>Event details</h3></div><span>{formatNumber(data.events.length)} shown</span></div>
              <div className="gameplay-timeline">{data.events.map((event) => <EventRow key={`detail-${event.id}`} event={event} />)}</div>
              {data.events.length < data.totalRecords && limit < 500 && <div className="load-more"><button type="button" onClick={onLoadMore}><ArrowRight size={17} /> Load more records</button></div>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventRow({ event }: { event: GameEvent }) {
  const [open, setOpen] = useState(false);
  const details = Object.entries(event.details).filter(([, value]) => value != null && value !== '' && value !== '[redacted]').slice(0, 16);
  return (
    <article className={`gameplay-event gameplay-event--${slug(event.category)}`}>
      <button type="button" className="gameplay-event__summary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="gameplay-event__icon">{categoryIcon(event.category)}</span>
        <span className="gameplay-event__content">
          <span className="gameplay-event__meta"><span>{event.category}</span><code>{event.eventType}</code><time dateTime={event.occurredAt}>{formatEventTime(event.occurredAt)}</time></span>
          <strong>{event.title}</strong>
          <span>{event.summary}</span>
          <span className="gameplay-event__facts">
            {event.amount != null && <span><CircleDollarSign size={14} /> {formatCurrency(event.amount)} aUEC</span>}
            {event.quantity != null && <span><Box size={14} /> {formatNumber(event.quantity)}</span>}
            {event.item && <span><PackageOpen size={14} /> {humanizeIdentifier(event.item)}</span>}
            {event.location && <span><MapPin size={14} /> {humanizeIdentifier(event.location)}</span>}
          </span>
        </span>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && (
        <div className="gameplay-event__details">
          {details.length > 0 ? details.map(([key, value]) => <div key={key}><span>{humanizeIdentifier(key)}</span><strong>{String(value)}</strong></div>) : <p>No additional structured fields were available for this event.</p>}
          <div className="gameplay-event__raw"><span>Sanitized source line</span><code>{event.rawSanitized}</code></div>
        </div>
      )}
    </article>
  );
}

function SessionHistory({ sessions, activeSessionId, currentSessionId, onSelect }: { sessions: GameSession[]; activeSessionId: number | null; currentSessionId: number | null; onSelect: (session: GameSession) => void }) {
  return (
    <aside className="session-history">
      <header><div><p className="eyebrow">Archive</p><h3>Session History</h3></div><span>{sessions.length}</span></header>
      <div className="session-history__list">
        {sessions.map((session) => (
          <button type="button" className={session.id === activeSessionId ? 'active' : ''} onClick={() => onSelect(session)} key={session.id}>
            <span className="session-history__top">
              <strong>{formatSessionDate(session.startedAt)}</strong>
              {session.id === currentSessionId && !session.endedAt ? <span className="session-live">Live</span> : <span>{formatDuration(session)}</span>}
            </span>
            <span className="session-history__bottom"><span>{session.channel}{session.build ? ` · ${session.build}` : ''}</span><span>{formatNumber(session.eventCount)} events</span></span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function categoryIcon(category: string): ReactNode {
  if (category === 'Missions') return <CheckCircle2 size={18} />;
  if (category === 'Commerce') return <ShoppingCart size={18} />;
  if (category === 'Cargo') return <Box size={18} />;
  if (category === 'Location') return <MapPin size={18} />;
  if (category === 'Vehicles') return <Rocket size={18} />;
  if (category === 'Combat') return <Crosshair size={18} />;
  if (category === 'Connection') return <Server size={18} />;
  if (category === 'Diagnostics') return <Gauge size={18} />;
  if (category === 'Social') return <Radio size={18} />;
  return <Terminal size={18} />;
}

function formatSessionLabel(session: GameSession): string {
  return `${session.channel} · ${formatSessionDate(session.startedAt)}`;
}

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function formatDrilldownContext(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatSessionDate(value);
  return value.split(',').map((part) => humanizeIdentifier(part.trim())).join(', ');
}

function formatSessionEnding(startedAt: string | null, endedAt: string | null): string {
  if (!endedAt) return 'Open';
  if (!startedAt) return formatSessionDate(endedAt);
  const minutes = Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60_000));
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return `${formatSessionDate(endedAt)} · ${duration}`;
}

function formatDuration(session: GameSession): string {
  if (!session.endedAt) return 'Open';
  const minutes = Math.max(1, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function humanizeIdentifier(value: string): string {
  return value.replace(/^SCShop_/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value || 0);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value || 0);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}
