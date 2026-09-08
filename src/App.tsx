import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  BookOpen,
  ChevronDown,
  CircuitBoard,
  Clock3,
  ExternalLink,
  Eye,
  House,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Newspaper,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Satellite,
  ScrollText,
  Settings as SettingsIcon,
  Ship as ShipIcon,
  Store,
  ThumbsUp,
  UserRound,
  WifiOff
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { fetchAnnouncementDetails, RSI_ANNOUNCEMENTS_URL } from './announcements/announcementService';
import { useAnnouncements } from './announcements/useAnnouncements';
import { ExpandableCard } from './components/ExpandableCard';
import { ComponentsBrowser } from './componentsDatabase/ComponentsBrowser';
import { UEX_COMPONENTS_URL } from './componentsDatabase/componentService';
import { useComponents } from './componentsDatabase/useComponents';
import { DATA_SOURCE_CREDITS } from './dataSources';
import { GameplayBrowser } from './gameplay/GameplayBrowser';
import { useGameplayStatus } from './gameplay/useGameplayStatus';
import { MarketBrowser } from './market/MarketBrowser';
import { PlayerMarketplace } from './playerMarketplace/PlayerMarketplace';
import { GuidesBrowser } from './guides/GuidesBrowser';
import { MyRsi } from './myRsi/MyRsi';
import { fetchNewsDetails, RSI_NEWS_URL } from './news/newsService';
import { useNews } from './news/useNews';
import { useUpdateNotifications } from './notifications/useUpdateNotifications';
import { useUnreadUpdates } from './notifications/useUnreadUpdates';
import { OrganizationsBrowser } from './organizations/OrganizationsBrowser';
import { fetchPatchNoteDetails, RSI_PATCH_NOTES_URL } from './patchNotes/patchNotesService';
import { usePatchNotes } from './patchNotes/usePatchNotes';
import { openExternalUrl } from './platform/openExternalUrl';
import { SettingsDialog } from './settings/SettingsDialog';
import { useAppSettings } from './settings/useAppSettings';
import { usePersistentState } from './state/usePersistentState';
import { ShipsBrowser } from './ships/ShipsBrowser';
import { UEX_VEHICLES_URL } from './ships/shipService';
import { useShips } from './ships/useShips';
import { RSI_STATUS_FEED_URL } from './status/statusService';
import type { ServiceLevel } from './status/types';
import { useStatusFeed } from './status/useStatusFeed';
import { TradeRoutePlanner } from './tradeRoutes/TradeRoutePlanner';
import { useTradeRoutes } from './tradeRoutes/useTradeRoutes';
import { UpdateBanner } from './updates/UpdateBanner';
import { useAppUpdater } from './updates/useAppUpdater';

export function App() {
  const [activeView, setActiveView] = useState<'home' | 'guides' | 'my-rsi' | 'player-marketplace' | 'announcements' | 'status' | 'patch-notes' | 'news' | 'ships' | 'components' | 'organizations' | 'market' | 'trade-routes' | 'gameplay'>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appSettings = useAppSettings();
  const appUpdater = useAppUpdater(
    appSettings.settings.notificationsEnabled && appSettings.settings.notifyAppUpdates
  );
  const announcements = useAnnouncements(appSettings.settings.contentRefreshMinutes);
  const status = useStatusFeed(appSettings.settings.statusRefreshMinutes);
  const patchNotes = usePatchNotes(appSettings.settings.contentRefreshMinutes);
  const news = useNews(appSettings.settings.contentRefreshMinutes);
  const ships = useShips();
  const components = useComponents();
  const tradeRoutes = useTradeRoutes();
  const gameplay = useGameplayStatus();
  const unreadUpdates = useUnreadUpdates({
    announcements: announcements.snapshot,
    status: status.snapshot,
    patchNotes: patchNotes.snapshot,
    news: news.snapshot
  });
  const lastResumeRefresh = useRef(Date.now());
  const overallLevel = status.snapshot?.currentStatus?.level ?? 'unknown';
  const overallMessage = status.snapshot?.currentStatus?.message ?? formatLevel(overallLevel);
  const isHomeView = activeView === 'home';
  const isGuidesView = activeView === 'guides';
  const isMyRsiView = activeView === 'my-rsi';
  const isAnnouncementsView = activeView === 'announcements';
  const isStatusView = activeView === 'status';
  const isPatchNotesView = activeView === 'patch-notes';
  const isShipsView = activeView === 'ships';
  const isComponentsView = activeView === 'components';
  const isOrganizationsView = activeView === 'organizations';
  const isMarketView = activeView === 'market';
  const isPlayerMarketplace = activeView === 'player-marketplace';
  const isTradeRoutesView = activeView === 'trade-routes';
  const isGameplayView = activeView === 'gameplay';
  const activeFeed = isGuidesView || isHomeView || isMyRsiView || isPlayerMarketplace || isGameplayView || isMarketView || isTradeRoutesView || isOrganizationsView ? null : isAnnouncementsView ? announcements : isStatusView ? status : isPatchNotesView ? patchNotes : isShipsView ? ships : isComponentsView ? components : news;
  const sourceUrl = isAnnouncementsView ? RSI_ANNOUNCEMENTS_URL : isStatusView ? RSI_STATUS_FEED_URL : isPatchNotesView ? RSI_PATCH_NOTES_URL : isShipsView ? UEX_VEHICLES_URL : isComponentsView ? UEX_COMPONENTS_URL : RSI_NEWS_URL;
  const sourceLabel = isAnnouncementsView ? 'Spectrum Announcements' : isStatusView ? 'RSI status RSS' : isPatchNotesView ? 'Spectrum Patch Notes' : isShipsView || isComponentsView ? 'UEX + Star Citizen Wiki' : 'RSI Comm-Link';

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([announcements.refresh(), status.refresh(), patchNotes.refresh(), news.refresh(), ships.refresh(), components.refresh(), tradeRoutes.refresh(), gameplay.refresh()]);
  }, [announcements.refresh, components.refresh, gameplay.refresh, news.refresh, patchNotes.refresh, ships.refresh, status.refresh, tradeRoutes.refresh]);

  useUpdateNotifications({
    settings: appSettings.settings,
    announcements: announcements.snapshot,
    status: status.snapshot,
    patchNotes: patchNotes.snapshot,
    news: news.snapshot
  });

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let removeListener: (() => void) | undefined;
    void listen('tray-refresh', () => void refreshAll()).then((unlisten) => {
      removeListener = unlisten;
    });
    return () => removeListener?.();
  }, [refreshAll]);

  useEffect(() => {
    function refreshAfterResume() {
      if (Date.now() - lastResumeRefresh.current < 30_000) return;
      lastResumeRefresh.current = Date.now();
      void refreshAll();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshAfterResume();
    }

    window.addEventListener('focus', refreshAfterResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshAfterResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshAll]);

  return (
    <main className="app-shell">
      <nav className="app-utility-nav" aria-label="Account and application controls">
        <button
          type="button"
          className={`home-button${isMyRsiView ? ' home-button--active' : ''}`}
          aria-current={isMyRsiView ? 'page' : undefined}
          onClick={() => setActiveView('my-rsi')}
        >
          <UserRound size={18} aria-hidden="true" />
          My RSI
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Open settings"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon size={19} aria-hidden="true" />
        </button>
      </nav>

      <section className="status-hero">
        <div>
          <p className="eyebrow">Star Citizen Desktop Companion</p>
          <h1>SC Companion</h1>
          <p className="hero-copy">
            Service status, patch releases, reference data, trade planning, and your local gameplay history.
          </p>
        </div>

        <div className="hero-actions">
          {!isHomeView && (
            <button type="button" className="home-button" onClick={() => setActiveView('home')}>
              <House size={18} aria-hidden="true" />
              Home
            </button>
          )}
          {isHomeView ? (
            <div className="status-pill">
              <LayoutGrid size={17} aria-hidden="true" />
              Categories
            </div>
          ) : isGuidesView ? <div className="status-pill"><BookOpen size={17} />Starter Guides</div> : isMyRsiView ? null : isPlayerMarketplace ? (
            <div className="status-pill"><Store size={17} aria-hidden="true" />Player Marketplace</div>
          ) : isAnnouncementsView ? (
            <div className="status-pill">
              <Megaphone size={17} aria-hidden="true" />
              Official Announcements
            </div>
          ) : isStatusView ? (
            <div className={`status-pill status-pill--${overallLevel}`}>
              <span aria-hidden="true" />
              {overallMessage}
            </div>
          ) : isPatchNotesView ? (
            <div className="status-pill">
              <Newspaper size={17} aria-hidden="true" />
              Official Patch Notes
            </div>
          ) : isShipsView ? (
            <div className="status-pill">
              <ShipIcon size={17} aria-hidden="true" />
              Ship Database
            </div>
          ) : isComponentsView ? (
            <div className="status-pill">
              <CircuitBoard size={17} aria-hidden="true" />
              Component Database
            </div>
          ) : isOrganizationsView ? (
            <div className="status-pill">
              <Building2 size={17} aria-hidden="true" />
              Organization Directory
            </div>
          ) : isTradeRoutesView ? (
            <div className="status-pill">
              <RouteIcon size={17} aria-hidden="true" />
              Trade Route Planner
            </div>
          ) : isMarketView ? (
            <div className="status-pill">
              <Store size={17} aria-hidden="true" />
              Commodity Market
            </div>
          ) : isGameplayView ? (
            <div className={`status-pill ${gameplay.status?.monitoring ? 'status-pill--operational' : 'status-pill--unknown'}`}>
              <ScrollText size={17} aria-hidden="true" />
              {gameplay.status?.monitoring ? 'Log Monitoring' : 'Log Tracker'}
            </div>
          ) : (
            <div className="status-pill">
              <Radio size={17} aria-hidden="true" />
              Latest RSI News
            </div>
          )}
        </div>
      </section>

      <UpdateBanner
        state={appUpdater.state}
        onInstall={appUpdater.installUpdate}
        onDismiss={appUpdater.dismissUpdate}
      />

      {isHomeView ? (
        <HomeDashboard
          announcementsCount={announcements.snapshot?.announcements.length ?? 0}
          newsCount={news.snapshot?.articles.length ?? 0}
          patchNotesCount={patchNotes.snapshot?.notes.length ?? 0}
          shipCount={ships.snapshot?.ships.length ?? 0}
          componentCount={components.snapshot?.components.length ?? 0}
          tradeRouteCount={tradeRoutes.snapshot?.prices.length ?? 0}
          marketCommodityCount={new Set(tradeRoutes.snapshot?.prices.map((price) => price.commodityId) ?? []).size}
          sessionCount={gameplay.status?.indexedSessions ?? 0}
          isTracking={gameplay.status?.monitoring ?? false}
          statusMessage={overallMessage}
          statusLevel={overallLevel}
          announcementsUnreadCount={unreadUpdates.counts.announcements}
          newsUnreadCount={unreadUpdates.counts.news}
          patchNotesUnreadCount={unreadUpdates.counts.patchNotes}
          statusUnreadCount={unreadUpdates.counts.status}
          onSelect={setActiveView}
        />
      ) : isGuidesView ? <GuidesBrowser /> : isPlayerMarketplace ? (
        <PlayerMarketplace />
      ) : isMyRsiView ? (
        <MyRsi />
      ) : isMarketView ? (
        <MarketBrowser
          snapshot={tradeRoutes.snapshot}
          isLoading={tradeRoutes.isLoading}
          error={tradeRoutes.error}
          usingCache={tradeRoutes.usingCache}
          onRefresh={tradeRoutes.refresh}
        />
      ) : isTradeRoutesView ? (
        <TradeRoutePlanner
          snapshot={tradeRoutes.snapshot}
          marketLoading={tradeRoutes.isLoading}
          marketError={tradeRoutes.error}
          usingCache={tradeRoutes.usingCache}
          onRefresh={tradeRoutes.refresh}
          ships={ships.snapshot?.ships ?? []}
          shipsLoading={ships.isLoading}
        />
      ) : isGameplayView ? (
        <GameplayBrowser overview={gameplay.status} />
      ) : isOrganizationsView ? (
        <OrganizationsBrowser />
      ) : activeFeed ? (
        <>
          <section className="toolbar" aria-label="Feed controls">
            <div className="feed-source">
              <Satellite size={18} aria-hidden="true" />
              <div>
                <span>Source</span>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => handleExternalLink(event, sourceUrl)}
                >
                  {sourceLabel}{' '}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </div>

            <div className="toolbar-actions">
              {activeFeed.snapshot && (
                <span className="timestamp">
                  <Clock3 size={16} aria-hidden="true" />
                  Updated {formatRelativeTime(activeFeed.snapshot.fetchedAt)}
                </span>
              )}
              <button
                type="button"
                className="refresh-button"
                onClick={() => void activeFeed.refresh()}
                disabled={activeFeed.isLoading}
              >
                <RefreshCw size={17} aria-hidden="true" className={activeFeed.isLoading ? 'spin' : undefined} />
                Refresh
              </button>
            </div>
          </section>

          {activeFeed.error && (
            <section className="notice notice--error" role="alert">
              <WifiOff size={19} aria-hidden="true" />
              <div>
                <strong>Refresh failed</strong>
                <span>{activeFeed.error}</span>
                {activeFeed.usingCache && <span>Showing the last saved updates from this device.</span>}
              </div>
            </section>
          )}

          {activeFeed.isLoading && !activeFeed.snapshot && (
            <section className="notice">
              <RefreshCw size={19} aria-hidden="true" className="spin" />
              <div>
                <strong>{isAnnouncementsView ? 'Loading announcements' : isStatusView ? 'Loading RSI updates' : isPatchNotesView ? 'Loading patch notes' : isShipsView ? 'Loading ship database' : isComponentsView ? 'Loading component database' : 'Loading RSI news'}</strong>
                <span>{isAnnouncementsView ? 'Fetching the latest official Spectrum announcements.' : isStatusView ? 'Fetching the current RSS feed.' : isPatchNotesView ? 'Fetching the latest Spectrum threads.' : isShipsView ? 'Combining ship specifications with purchase and rental data.' : isComponentsView ? 'Combining component specifications with in-game shop prices.' : 'Fetching the latest Comm-Link articles.'}</span>
              </div>
            </section>
          )}

          {isAnnouncementsView ? (
            <Announcements
              snapshot={announcements.snapshot}
              isLoading={announcements.isLoading}
              loadMore={announcements.loadMore}
              isLoadingMore={announcements.isLoadingMore}
              hasMore={announcements.hasMore}
              isUnread={(id) => unreadUpdates.isUnread('announcements', id)}
              onRead={(id) => unreadUpdates.markRead('announcements', id)}
            />
          ) : isStatusView ? (
            <StatusUpdates
              snapshot={status.snapshot}
              isLoading={status.isLoading}
              isUnread={(id) => unreadUpdates.isUnread('status', id)}
              onRead={(id) => unreadUpdates.markRead('status', id)}
            />
          ) : isPatchNotesView ? (
            <PatchNotes
              snapshot={patchNotes.snapshot}
              isLoading={patchNotes.isLoading}
              loadMore={patchNotes.loadMore}
              isLoadingMore={patchNotes.isLoadingMore}
              hasMore={patchNotes.hasMore}
              isUnread={(id) => unreadUpdates.isUnread('patch-notes', id)}
              onRead={(id) => unreadUpdates.markRead('patch-notes', id)}
            />
          ) : isShipsView ? (
            <ShipsBrowser snapshot={ships.snapshot} isLoading={ships.isLoading} />
          ) : isComponentsView ? (
            <ComponentsBrowser snapshot={components.snapshot} isLoading={components.isLoading} />
          ) : (
            <News
              snapshot={news.snapshot}
              isLoading={news.isLoading}
              loadMore={news.loadMore}
              isLoadingMore={news.isLoadingMore}
              hasMore={news.hasMore}
              isUnread={(id) => unreadUpdates.isUnread('news', id)}
              onRead={(id) => unreadUpdates.markRead('news', id)}
            />
          )}
        </>
      ) : null}

      <footer className="community-disclaimer">
        <img
          src="/made-by-community.png"
          alt="Made by the Community"
          className="community-disclaimer__logo"
        />
        <div className="community-disclaimer__body">
          <div className="community-disclaimer__legal">
            <strong>Unofficial fan project</strong>
            <p>
              SC Companion is an unofficial Star Citizen fan application and is not affiliated with the
              Cloud Imperium group of companies. Content not authored by this application's host or users
              remains the property of its respective owners.
            </p>
            <p className="community-disclaimer__trademarks">
              Star Citizen®, Roberts Space Industries®, and Cloud Imperium® are registered trademarks of
              Cloud Imperium Rights LLC.
            </p>
          </div>
          <div className="community-disclaimer__sources">
            <strong>Data sources</strong>
            <div className="data-source-list">
              {DATA_SOURCE_CREDITS.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => handleExternalLink(event, source.url)}
                >
                  <span>{source.name}</span>
                  <small>{source.contribution}</small>
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          settings={appSettings.settings}
          notificationPermission={appSettings.notificationPermission}
          error={appSettings.error}
          onClose={() => setSettingsOpen(false)}
          onUpdate={appSettings.updateSettings}
          onSetNotifications={appSettings.setNotificationsEnabled}
          onSetLaunchAtStartup={appSettings.setLaunchAtStartup}
          onTestNotification={appSettings.sendTestNotification}
          updater={appUpdater.state}
          onCheckForUpdates={() => appUpdater.checkForUpdates(true)}
          onInstallUpdate={appUpdater.installUpdate}
        />
      )}
    </main>
  );
}

type FeedView = 'guides' | 'player-marketplace' | 'announcements' | 'status' | 'patch-notes' | 'news' | 'ships' | 'components' | 'organizations' | 'market' | 'trade-routes' | 'gameplay';

function HomeDashboard({
  announcementsCount,
  newsCount,
  patchNotesCount,
  shipCount,
  componentCount,
  tradeRouteCount,
  marketCommodityCount,
  sessionCount,
  isTracking,
  statusMessage,
  statusLevel,
  announcementsUnreadCount,
  newsUnreadCount,
  patchNotesUnreadCount,
  statusUnreadCount,
  onSelect
}: {
  announcementsCount: number;
  newsCount: number;
  patchNotesCount: number;
  shipCount: number;
  componentCount: number;
  tradeRouteCount: number;
  marketCommodityCount: number;
  sessionCount: number;
  isTracking: boolean;
  statusMessage: string;
  statusLevel: ServiceLevel;
  announcementsUnreadCount: number;
  newsUnreadCount: number;
  patchNotesUnreadCount: number;
  statusUnreadCount: number;
  onSelect: (view: FeedView) => void;
}) {
  return (
    <section className="category-section">
      <div className="section-heading category-heading">
        <div>
          <p className="eyebrow">Browse</p>
          <h2>Categories</h2>
        </div>
      </div>

      <section className="category-group" aria-labelledby="category-updates">
      <h3 id="category-updates">Updates</h3>
      <div className="category-grid">
        <CategoryCard
          title="Announcements"
          description="Official Star Citizen announcements, service changes, events, policies, and major releases."
          meta={announcementsCount > 0 ? `${announcementsCount} recent posts` : 'Official Spectrum posts'}
          icon={<Megaphone size={25} aria-hidden="true" />}
          unreadCount={announcementsUnreadCount}
          onClick={() => onSelect('announcements')}
        />
        <CategoryCard
          title="News"
          description="Comm-Link announcements, weekly updates, events, videos, and development reports."
          meta={newsCount > 0 ? `${newsCount} recent articles` : 'Official RSI Comm-Link'}
          icon={<Radio size={25} aria-hidden="true" />}
          unreadCount={newsUnreadCount}
          onClick={() => onSelect('news')}
        />
        <CategoryCard
          title="Patch Notes"
          description="The latest LIVE, PTU, hotfix, and release notes from the official Spectrum forum."
          meta={patchNotesCount > 0 ? `${patchNotesCount} recent posts` : 'Official Spectrum posts'}
          icon={<Newspaper size={25} aria-hidden="true" />}
          unreadCount={patchNotesUnreadCount}
          onClick={() => onSelect('patch-notes')}
        />
        <CategoryCard
          title="Server Status"
          description="Current service health and incident updates for the RSI platform and game services."
          meta={statusMessage}
          metaLevel={statusLevel}
          icon={<Activity size={25} aria-hidden="true" />}
          unreadCount={statusUnreadCount}
          onClick={() => onSelect('status')}
        />
      </div>
      </section>
      <section className="category-group" aria-labelledby="category-reference">
      <h3 id="category-reference">Reference</h3>
      <div className="category-grid">
        <CategoryCard title="Starter Guides" description="Official RSI beginner guides, illustrated tutorials, and videos." meta="RSI Knowledge Base" icon={<BookOpen size={25} aria-hidden="true" />} onClick={() => onSelect('guides')} />
        <CategoryCard
          title="Ships"
          description="Browse ship specifications, roles, cargo capacity, and in-game purchase or rental locations."
          meta={shipCount > 0 ? `${shipCount} ships and vehicles` : 'UEX and Wiki data'}
          icon={<ShipIcon size={25} aria-hidden="true" />}
          onClick={() => onSelect('ships')}
        />
        <CategoryCard
          title="Ship Components"
          description="Compare ship systems, weapons, utility equipment, specifications, and in-game shop prices."
          meta={componentCount > 0 ? `${componentCount} components` : 'UEX and Wiki data'}
          icon={<CircuitBoard size={25} aria-hidden="true" />}
          onClick={() => onSelect('components')}
        />
        <CategoryCard
          title="Organizations"
          description="Search public RSI organizations, review their profiles, and browse visible members, ranks, and roles."
          meta="Public RSI directory"
          icon={<Building2 size={25} aria-hidden="true" />}
          onClick={() => onSelect('organizations')}
        />
      </div>
      </section>
      <section className="category-group" aria-labelledby="category-trading">
      <h3 id="category-trading">Trading Tools</h3>
      <div className="category-grid">
        <CategoryCard
          title="Market"
          description="Browse commodity prices, stock, demand, locations, container sizes, and cargo services."
          meta={marketCommodityCount > 0 ? `${marketCommodityCount} commodities` : 'Live UEX market data'}
          icon={<Store size={25} aria-hidden="true" />}
          onClick={() => onSelect('market')}
        />
        <CategoryCard
          title="Player Marketplace"
          description="Player-listed items, seller asking prices, available stock, and pickup locations."
          meta="UEX player listings"
          icon={<Store size={25} aria-hidden="true" />}
          onClick={() => onSelect('player-marketplace')}
        />
        <CategoryCard
          title="Trade Routes"
          description="Plan commodity runs by ship, budget, system, terminals, cargo handling, and expected profit."
          meta={tradeRouteCount > 0 ? `${tradeRouteCount.toLocaleString()} market reports` : 'Live UEX market data'}
          icon={<RouteIcon size={25} aria-hidden="true" />}
          onClick={() => onSelect('trade-routes')}
        />
      </div>
      </section>
      <section className="category-group" aria-labelledby="category-tools">
      <h3 id="category-tools">Tools</h3>
      <div className="category-grid">
        <CategoryCard
          title="Live Sessions"
          description="Capture gameplay events from Game.log and review live activity, session history, and combined totals."
          meta={sessionCount > 0 ? `${sessionCount} captured sessions` : isTracking ? 'Monitoring Game.log' : 'Local log tracking'}
          icon={<ScrollText size={25} aria-hidden="true" />}
          onClick={() => onSelect('gameplay')}
        />
      </div>
      </section>
    </section>
  );
}

function CategoryCard({
  title,
  description,
  meta,
  metaLevel,
  icon,
  unreadCount = 0,
  onClick
}: {
  title: string;
  description: string;
  meta: string;
  metaLevel?: ServiceLevel;
  icon: ReactNode;
  unreadCount?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className="category-card" onClick={onClick} aria-label={unreadCount > 0 ? `${title}, ${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : title}>
      {unreadCount > 0 && <span className="category-card__unread" title={`${unreadCount} unread update${unreadCount === 1 ? '' : 's'}`} aria-hidden="true" />}
      <span className="category-card__icon">{icon}</span>
      <span className="category-card__content">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="category-card__footer">
        <span className={metaLevel ? `category-card__meta category-card__meta--${metaLevel}` : 'category-card__meta'}>
          {metaLevel && <span aria-hidden="true" />}
          {meta}
        </span>
        <ArrowRight className="category-card__arrow" size={19} aria-hidden="true" />
      </span>
    </button>
  );
}

function Announcements({
  snapshot,
  isLoading,
  loadMore,
  isLoadingMore,
  hasMore,
  isUnread,
  onRead
}: Pick<ReturnType<typeof useAnnouncements>, 'snapshot' | 'isLoading' | 'loadMore' | 'isLoadingMore' | 'hasMore'> & {
  isUnread: (id: string) => boolean;
  onRead: (id: string) => void;
}) {
  return (
    <section className="updates-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Official Updates</p>
          <h2>Star Citizen Announcements</h2>
        </div>
        <p>Major game, community, account, event, and platform announcements from RSI.</p>
      </div>

      <div className="updates-list">
        {(snapshot?.announcements ?? []).map((announcement) => (
          <ExpandableCard
            key={announcement.id}
            className="patch-card"
            title={announcement.title}
            preview={`Official Spectrum post by ${announcement.author}.`}
            loadContent={() => fetchAnnouncementDetails(announcement.url)}
            externalUrl={announcement.url}
            externalLabel="Open on Spectrum"
            unread={isUnread(announcement.id)}
            onRead={() => onRead(announcement.id)}
            meta={
              <>
                <span className="patch-channel patch-channel--live">Announcement</span>
                <time dateTime={announcement.publishedAt}>{formatDate(announcement.publishedAt)}</time>
              </>
            }
            footer={
              <div className="patch-metrics" aria-label="Thread activity">
                <span title="Replies"><MessageSquare size={15} aria-hidden="true" /> {formatCount(announcement.replies)}</span>
                <span title="Views"><Eye size={15} aria-hidden="true" /> {formatCount(announcement.views)}</span>
                <span title="Votes"><ThumbsUp size={15} aria-hidden="true" /> {formatCount(announcement.votes)}</span>
              </div>
            }
          />
        ))}
      </div>

      {hasMore && snapshot && snapshot.announcements.length > 0 && (
        <LoadMoreButton onClick={() => void loadMore()} isLoading={isLoadingMore} />
      )}

      {!isLoading && snapshot?.announcements.length === 0 && (
        <section className="notice">
          <AlertTriangle size={19} aria-hidden="true" />
          <div>
            <strong>No announcements found</strong>
            <span>Spectrum loaded, but it did not include any announcement threads.</span>
          </div>
        </section>
      )}
    </section>
  );
}

function News({
  snapshot,
  isLoading,
  loadMore,
  isLoadingMore,
  hasMore,
  isUnread,
  onRead
}: Pick<ReturnType<typeof useNews>, 'snapshot' | 'isLoading' | 'loadMore' | 'isLoadingMore' | 'hasMore'> & {
  isUnread: (id: string) => boolean;
  onRead: (id: string) => void;
}) {
  return (
    <section className="updates-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Latest Headlines</p>
          <h2>Official RSI News</h2>
        </div>
        <p>Comm-Link announcements, weekly updates, roadmap reports, events, and videos.</p>
      </div>

      <div className="updates-list">
        {(snapshot?.articles ?? []).map((article) => (
          <ExpandableCard
            key={article.id}
            className="news-card"
            title={article.title}
            preview={article.summary}
            loadContent={() => fetchNewsDetails(article.url)}
            externalUrl={article.url}
            externalLabel="Open on RSI"
            unread={isUnread(article.id)}
            onRead={() => onRead(article.id)}
            meta={
              <>
                <span className={`news-category news-category--${article.category.toLowerCase()}`}>
                  {article.category}
                </span>
                <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
              </>
            }
            footer={article.comments > 0 ? (
              <div className="patch-metrics" aria-label="Article activity">
                <span title="Comments"><MessageSquare size={15} aria-hidden="true" /> {formatCount(article.comments)}</span>
              </div>
            ) : undefined}
          />
        ))}
      </div>

      {hasMore && snapshot && snapshot.articles.length > 0 && (
        <LoadMoreButton onClick={() => void loadMore()} isLoading={isLoadingMore} />
      )}

      {!isLoading && snapshot?.articles.length === 0 && (
        <section className="notice">
          <AlertTriangle size={19} aria-hidden="true" />
          <div>
            <strong>No news articles found</strong>
            <span>Comm-Link loaded, but it did not include any recent articles.</span>
          </div>
        </section>
      )}
    </section>
  );
}

function StatusUpdates({
  snapshot,
  isLoading,
  isUnread,
  onRead
}: Pick<ReturnType<typeof useStatusFeed>, 'snapshot' | 'isLoading'> & {
  isUnread: (id: string) => boolean;
  onRead: (id: string) => void;
}) {
  const [visibleCount, setVisibleCount] = usePersistentState('status.visible-count', 10);
  const updates = snapshot?.updates ?? [];
  const visibleUpdates = updates.slice(0, visibleCount);

  return (
    <section className="updates-section">
        {snapshot?.currentStatus && (
          <section className={`current-status current-status--${snapshot.currentStatus.level}`}>
            <div className="current-status__heading">
              <div>
                <p className="eyebrow">Current Service Status</p>
                <h2>{snapshot.currentStatus.message}</h2>
              </div>
              <span className={`current-status__overall current-status__overall--${snapshot.currentStatus.level}`}>
                <span aria-hidden="true" />
                {formatLevel(snapshot.currentStatus.level)}
              </span>
            </div>
            <div className="service-status-list">
              {snapshot.currentStatus.services.map((service) => (
                <div className="service-status-row" key={service.name}>
                  <span>{service.name}</span>
                  <strong className={`service-status-row__state service-status-row__state--${service.level}`}>
                    <span aria-hidden="true" />
                    {service.label}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="section-heading">
          <div>
            <p className="eyebrow">Recent Updates</p>
            <h2>{snapshot?.feedTitle ?? 'RSI Status'}</h2>
          </div>
          <p>{snapshot?.feedDescription ?? 'Waiting for the first feed response.'}</p>
        </div>

        <div className="updates-list">
          {visibleUpdates.map((update) => (
            <ExpandableCard
              key={update.id}
              title={update.title}
              preview={update.description || 'No summary was included in the feed item.'}
              content={update.description || 'No details were included in the feed item.'}
              externalUrl={update.link || undefined}
              externalLabel="Open status page"
              unread={isUnread(update.id)}
              onRead={() => onRead(update.id)}
              meta={
                <>
                <span className={`level-dot level-dot--${update.level}`} aria-hidden="true" />
                <span>{update.category}</span>
                <time dateTime={update.publishedAt}>{formatDate(update.publishedAt)}</time>
                </>
              }
            />
          ))}
        </div>

        {visibleCount < updates.length && (
          <LoadMoreButton onClick={() => setVisibleCount((count) => count + 10)} />
        )}

        {!isLoading && snapshot?.updates.length === 0 && (
          <section className="notice">
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>No status entries found</strong>
              <span>The feed loaded, but it did not contain recent RSS items.</span>
            </div>
          </section>
        )}
      </section>
  );
}

function PatchNotes({
  snapshot,
  isLoading,
  loadMore,
  isLoadingMore,
  hasMore,
  isUnread,
  onRead
}: Pick<ReturnType<typeof usePatchNotes>, 'snapshot' | 'isLoading' | 'loadMore' | 'isLoadingMore' | 'hasMore'> & {
  isUnread: (id: string) => boolean;
  onRead: (id: string) => void;
}) {
  return (
    <section className="updates-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Latest Releases</p>
          <h2>Official Patch Notes</h2>
        </div>
        <p>Current LIVE, PTU, release, and hotfix posts from the official Spectrum forum.</p>
      </div>

      <div className="updates-list">
        {(snapshot?.notes ?? []).map((note) => (
          <ExpandableCard
            key={note.id}
            className="patch-card"
            title={note.title}
            preview={`Official Spectrum post by ${note.author}.`}
            loadContent={() => fetchPatchNoteDetails(note.url)}
            externalUrl={note.url}
            externalLabel="Open on Spectrum"
            unread={isUnread(note.id)}
            onRead={() => onRead(note.id)}
            meta={
              <>
              <span className={`patch-channel patch-channel--${note.channel.toLowerCase()}`}>
                {note.channel}
              </span>
              <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time>
              </>
            }
            footer={
              <div className="patch-metrics" aria-label="Thread activity">
                <span title="Replies"><MessageSquare size={15} aria-hidden="true" /> {formatCount(note.replies)}</span>
                <span title="Views"><Eye size={15} aria-hidden="true" /> {formatCount(note.views)}</span>
                <span title="Votes"><ThumbsUp size={15} aria-hidden="true" /> {formatCount(note.votes)}</span>
              </div>
            }
          />
        ))}
      </div>

      {hasMore && snapshot && snapshot.notes.length > 0 && (
        <LoadMoreButton onClick={() => void loadMore()} isLoading={isLoadingMore} />
      )}

      {!isLoading && snapshot?.notes.length === 0 && (
        <section className="notice">
          <AlertTriangle size={19} aria-hidden="true" />
          <div>
            <strong>No patch notes found</strong>
            <span>Spectrum loaded, but it did not include any recent patch-note threads.</span>
          </div>
        </section>
      )}
    </section>
  );
}

function LoadMoreButton({ onClick, isLoading = false }: { onClick: () => void; isLoading?: boolean }) {
  return (
    <div className="load-more">
      <button type="button" onClick={onClick} disabled={isLoading}>
        {isLoading ? (
          <RefreshCw size={17} className="spin" aria-hidden="true" />
        ) : (
          <ChevronDown size={17} aria-hidden="true" />
        )}
        {isLoading ? 'Loading...' : 'Load more'}
      </button>
    </div>
  );
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>, url: string): void {
  if (!window.__TAURI_INTERNALS__) {
    return;
  }

  event.preventDefault();
  void openExternalUrl(url).catch((error) => {
    console.error('Could not open the link in the default browser.', error);
  });
}

function formatLevel(level: ServiceLevel): string {
  const labels: Record<ServiceLevel, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    outage: 'Outage',
    maintenance: 'Maintenance',
    unknown: 'Status Unknown'
  };
  return labels[level];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatRelativeTime(value: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
