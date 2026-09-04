import {
  Bookmark,
  Building2,
  ChevronRight,
  ExternalLink,
  Globe2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { usePersistentState } from '../state/usePersistentState';
import {
  fetchOrganizationDetail,
  fetchOrganizationMembers,
  getCachedOrganizationSearch,
  searchOrganizations
} from './organizationService';
import type {
  OrganizationDetail,
  OrganizationMember,
  OrganizationSearchFilters,
  OrganizationSummary
} from './types';

const DEFAULT_FILTERS: OrganizationSearchFilters = {
  search: '',
  archetype: 'all',
  commitment: 'all',
  recruiting: 'all',
  rolePlay: 'all'
};

type DetailTab = 'overview' | 'members' | 'history' | 'manifesto' | 'charter';
type MemberSort = 'handle' | 'rank' | 'affiliation';
type MemberRange = 'all' | '1-10' | '11-50' | '51-200' | '201+';

export function OrganizationsBrowser() {
  const cached = useMemo(getCachedOrganizationSearch, []);
  const [search, setSearch] = usePersistentState('organizations.search', '');
  const [archetype, setArchetype] = usePersistentState('organizations.archetype', 'all');
  const [commitment, setCommitment] = usePersistentState('organizations.commitment', 'all');
  const [recruiting, setRecruiting] = usePersistentState('organizations.recruiting', 'all');
  const [rolePlay, setRolePlay] = usePersistentState('organizations.role-play', 'all');
  const [memberRange, setMemberRange] = usePersistentState<MemberRange>('organizations.member-range', 'all');
  const [favorites, setFavorites] = usePersistentState<OrganizationSummary[]>('organizations.favorites', []);
  const [savedOnly, setSavedOnly] = usePersistentState('organizations.saved-only', false);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>(cached?.organizations ?? []);
  const [page, setPage] = useState(cached?.page ?? 1);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [fetchedAt, setFetchedAt] = useState(cached?.fetchedAt ?? null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrganizationSummary | null>(null);
  const requestId = useRef(0);
  const closeSelected = useCallback(() => setSelected(null), []);

  const filters = useMemo<OrganizationSearchFilters>(() => ({ search, archetype, commitment, recruiting, rolePlay }), [archetype, commitment, recruiting, rolePlay, search]);
  const visibleOrganizations = useMemo(
    () => (savedOnly ? favorites : organizations)
      .filter((organization) => matchesMemberRange(organization.memberCount, memberRange))
      .sort(compareOrganizationsByMembers),
    [favorites, memberRange, organizations, savedOnly]
  );
  const favoriteSids = useMemo(() => new Set(favorites.map((item) => item.sid)), [favorites]);

  async function runSearch(nextPage = 1) {
    const currentRequest = ++requestId.current;
    if (nextPage === 1) setIsLoading(true);
    else setIsLoadingMore(true);
    setError(null);
    try {
      const result = await searchOrganizations(filters, nextPage);
      if (requestId.current !== currentRequest) return;
      setOrganizations((current) => nextPage === 1 ? result.organizations : mergeOrganizations(current, result.organizations));
      setPage(result.page);
      setHasMore(result.hasMore);
      setFetchedAt(result.fetchedAt);
    } catch (cause) {
      if (requestId.current !== currentRequest) return;
      setError(cause instanceof Error ? cause.message : 'Could not load public RSI organizations.');
    } finally {
      if (requestId.current === currentRequest) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    void runSearch(1);
    // Persisted filters intentionally define the first request for this mounted view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSavedOnly(false);
    void runSearch(1);
  }

  function resetFilters() {
    setSearch(DEFAULT_FILTERS.search);
    setArchetype(DEFAULT_FILTERS.archetype);
    setCommitment(DEFAULT_FILTERS.commitment);
    setRecruiting(DEFAULT_FILTERS.recruiting);
    setRolePlay(DEFAULT_FILTERS.rolePlay);
    setMemberRange('all');
    setSavedOnly(false);
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    void searchOrganizations(DEFAULT_FILTERS, 1)
      .then((result) => {
        if (requestId.current !== currentRequest) return;
        setOrganizations(result.organizations);
        setPage(1);
        setHasMore(result.hasMore);
        setFetchedAt(result.fetchedAt);
      })
      .catch((cause) => {
        if (requestId.current === currentRequest) setError(cause instanceof Error ? cause.message : 'Could not load public RSI organizations.');
      })
      .finally(() => {
        if (requestId.current === currentRequest) setIsLoading(false);
      });
  }

  function toggleFavorite(organization: OrganizationSummary) {
    setFavorites((current) => current.some((item) => item.sid === organization.sid)
      ? current.filter((item) => item.sid !== organization.sid)
      : [...current, organization].sort(compareOrganizationsByMembers));
  }

  return (
    <section className="organizations-section">
      <div className="section-heading organizations-heading">
        <div>
          <p className="eyebrow">Public RSI Directory</p>
          <h2>Organizations</h2>
        </div>
        <p>{savedOnly
          ? `${visibleOrganizations.length} of ${favorites.length} saved`
          : `${visibleOrganizations.length} of ${organizations.length} results loaded`}</p>
      </div>

      <form className="organization-filters" onSubmit={submitSearch}>
        <label className="organization-search">
          <Search size={18} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organization name or Spectrum ID" />
        </label>
        <FilterSelect label="Archetype" value={archetype} onChange={setArchetype}>
          <option value="all">All archetypes</option>
          <option value="generic">Organization</option>
          <option value="corp">Corporation</option>
          <option value="pmc">PMC</option>
          <option value="faith">Faith</option>
          <option value="syndicate">Syndicate</option>
          <option value="club">Club</option>
        </FilterSelect>
        <FilterSelect label="Commitment" value={commitment} onChange={setCommitment}>
          <option value="all">Any commitment</option>
          <option value="CA">Casual</option>
          <option value="RE">Regular</option>
          <option value="HA">Hardcore</option>
        </FilterSelect>
        <FilterSelect label="Recruiting" value={recruiting} onChange={setRecruiting}>
          <option value="all">Either</option>
          <option value="1">Recruiting</option>
          <option value="0">Not recruiting</option>
        </FilterSelect>
        <FilterSelect label="Role play" value={rolePlay} onChange={setRolePlay}>
          <option value="all">Either</option>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </FilterSelect>
        <FilterSelect label="Members" value={memberRange} onChange={(value) => setMemberRange(value as MemberRange)}>
          <option value="all">Any size</option>
          <option value="1-10">1-10 members</option>
          <option value="11-50">11-50 members</option>
          <option value="51-200">51-200 members</option>
          <option value="201+">201+ members</option>
        </FilterSelect>
        <button type="submit" className="organization-search-button" disabled={isLoading}>
          <Search size={16} aria-hidden="true" /> Search
        </button>
        <button type="button" className="clear-filters" onClick={resetFilters}>
          <SlidersHorizontal size={16} aria-hidden="true" /> Reset
        </button>
      </form>

      <div className="organization-viewbar">
        <div className="organization-view-mode" role="group" aria-label="Organization results">
          <button type="button" className={!savedOnly ? 'active' : ''} onClick={() => setSavedOnly(false)}>
            <Globe2 size={16} aria-hidden="true" /> Directory
          </button>
          <button type="button" className={savedOnly ? 'active' : ''} onClick={() => setSavedOnly(true)}>
            <Bookmark size={16} aria-hidden="true" /> Saved ({favorites.length})
          </button>
        </div>
        {fetchedAt && !savedOnly && <span>Updated {formatRelativeTime(fetchedAt)}</span>}
      </div>

      {error && (
        <section className="notice notice--error" role="alert">
          <Building2 size={19} aria-hidden="true" />
          <div><strong>Organizations unavailable</strong><span>{error}</span></div>
        </section>
      )}

      {isLoading && organizations.length === 0 ? (
        <section className="notice">
          <Search size={19} aria-hidden="true" />
          <div><strong>Searching organizations</strong><span>Reading the public RSI organization directory.</span></div>
        </section>
      ) : (
        <div className="organization-list">
          {visibleOrganizations.map((organization) => (
            <OrganizationRow
              key={organization.sid}
              organization={organization}
              isFavorite={favoriteSids.has(organization.sid)}
              onFavorite={() => toggleFavorite(organization)}
              onOpen={() => setSelected(organization)}
            />
          ))}
        </div>
      )}

      {!isLoading && visibleOrganizations.length === 0 && (
        <section className="notice">
          <Building2 size={19} aria-hidden="true" />
          <div>
            <strong>{savedOnly ? 'No saved organizations' : 'No organizations found'}</strong>
            <span>{savedOnly ? 'Use the star button on a result to keep it here.' : 'Try a broader name or reset the filters.'}</span>
          </div>
        </section>
      )}

      {!savedOnly && hasMore && organizations.length > 0 && (
        <div className="load-more">
          <button type="button" onClick={() => void runSearch(page + 1)} disabled={isLoadingMore}>
            <ChevronRight size={17} aria-hidden="true" /> {isLoadingMore ? 'Loading...' : 'Load more organizations'}
          </button>
        </div>
      )}

      {selected && (
        <OrganizationDialog
          summary={selected}
          isFavorite={favoriteSids.has(selected.sid)}
          onFavorite={() => toggleFavorite(selected)}
          onClose={closeSelected}
        />
      )}
    </section>
  );
}

function OrganizationRow({ organization, isFavorite, onFavorite, onOpen }: {
  organization: OrganizationSummary;
  isFavorite: boolean;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="organization-row">
      <button type="button" className="organization-row__main" onClick={onOpen}>
        <OrganizationLogo organization={organization} />
        <span className="organization-row__identity">
          <strong>{organization.name}</strong>
          <span>{organization.sid}</span>
        </span>
        <span className="organization-row__field"><small>Archetype</small><strong>{organization.archetype}</strong></span>
        <span className="organization-row__field"><small>Commitment</small><strong>{organization.commitment}</strong></span>
        <span className="organization-row__field"><small>Language</small><strong>{organization.language}</strong></span>
        <span className="organization-row__field"><small>Members</small><strong>{organization.memberCount.toLocaleString()}</strong></span>
        <span className="organization-row__field"><small>Recruiting</small><strong>{formatBoolean(organization.recruiting)}</strong></span>
        <ChevronRight className="organization-row__arrow" size={20} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`organization-favorite ${isFavorite ? 'active' : ''}`}
        onClick={onFavorite}
        aria-label={isFavorite ? `Remove ${organization.name} from saved organizations` : `Save ${organization.name}`}
        title={isFavorite ? 'Remove from saved' : 'Save organization'}
      >
        <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </article>
  );
}

function OrganizationDialog({ summary, isFavorite, onFavorite, onClose }: {
  summary: OrganizationSummary;
  isFavorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('overview');
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [memberPage, setMemberPage] = useState(0);
  const [hasMoreMembers, setHasMoreMembers] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberAffiliation, setMemberAffiliation] = useState('all');
  const [memberRank, setMemberRank] = useState('all');
  const [memberSort, setMemberSort] = useState<MemberSort>('handle');

  useEffect(() => {
    let active = true;
    document.body.style.overflow = 'hidden';
    void fetchOrganizationDetail(summary.sid)
      .then((result) => { if (active) setDetail({ ...result, language: summary.language, recruiting: summary.recruiting, rolePlay: summary.rolePlay }); })
      .catch((cause) => { if (active) setDetailError(cause instanceof Error ? cause.message : 'Could not load organization details.'); });
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      active = false;
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, summary.language, summary.recruiting, summary.rolePlay, summary.sid]);

  async function loadMembers(page: number) {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const result = await fetchOrganizationMembers(summary.sid, page);
      setMembers((current) => page === 1 ? result.members : mergeMembers(current, result.members));
      setMemberPage(page);
      setHasMoreMembers(result.hasMore);
    } catch (cause) {
      setMembersError(cause instanceof Error ? cause.message : 'Could not load the public member roster.');
    } finally {
      setMembersLoading(false);
    }
  }

  function selectTab(nextTab: DetailTab) {
    setTab(nextTab);
    if (nextTab === 'members' && memberPage === 0 && !membersLoading) void loadMembers(1);
  }

  const ranks = useMemo(() => [...new Set(members.map((member) => member.rank))].sort(), [members]);
  const visibleMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return members
      .filter((member) => !query || `${member.handle} ${member.rank} ${member.roles.join(' ')}`.toLowerCase().includes(query))
      .filter((member) => memberAffiliation === 'all' || member.affiliation === memberAffiliation)
      .filter((member) => memberRank === 'all' || member.rank === memberRank)
      .sort((left, right) => {
        if (memberSort === 'rank') return left.rank.localeCompare(right.rank) || left.handle.localeCompare(right.handle);
        if (memberSort === 'affiliation') return left.affiliation.localeCompare(right.affiliation) || left.handle.localeCompare(right.handle);
        return left.handle.localeCompare(right.handle);
      });
  }, [memberAffiliation, memberRank, memberSearch, memberSort, members]);

  const organization = detail ?? summary;

  return (
    <div className="ship-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ship-dialog organization-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-dialog-title">
        <header className="ship-dialog__header organization-dialog__header">
          <div>
            <span>{organization.sid}</span>
            <h2 id="organization-dialog-title">{organization.name}</h2>
          </div>
          <div className="organization-dialog__actions">
            <button type="button" className={`organization-favorite ${isFavorite ? 'active' : ''}`} onClick={onFavorite} title={isFavorite ? 'Remove from saved' : 'Save organization'}>
              <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close organization details" title="Close">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <OrganizationHero organization={organization} detail={detail} />

        <div className="ship-dialog__content">
          <nav className="ship-detail-tabs" aria-label="Organization details">
            {(['overview', 'members', 'history', 'manifesto', 'charter'] as DetailTab[]).map((item) => (
              <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => selectTab(item)}>
                {item === 'members' ? `Members (${organization.memberCount.toLocaleString()})` : titleCase(item)}
              </button>
            ))}
          </nav>

          {detailError && <section className="notice notice--error"><Building2 size={19} aria-hidden="true" /><div><strong>Details unavailable</strong><span>{detailError}</span></div></section>}
          {!detail && !detailError && <p className="ship-tab-loading">Loading public organization details...</p>}

          {tab === 'overview' && detail && <OrganizationOverview detail={detail} />}
          {tab === 'members' && (
            <MembersTab
              members={visibleMembers}
              loadedCount={members.length}
              reportedCount={organization.memberCount}
              isLoading={membersLoading}
              error={membersError}
              hasMore={hasMoreMembers}
              search={memberSearch}
              affiliation={memberAffiliation}
              rank={memberRank}
              sort={memberSort}
              ranks={ranks}
              onSearch={setMemberSearch}
              onAffiliation={setMemberAffiliation}
              onRank={setMemberRank}
              onSort={(value) => setMemberSort(value as MemberSort)}
              onLoadMore={() => void loadMembers(memberPage + 1)}
            />
          )}
          {tab === 'history' && detail && <TextTab title="History" content={detail.history} />}
          {tab === 'manifesto' && detail && <TextTab title="Manifesto" content={detail.manifesto} />}
          {tab === 'charter' && detail && <TextTab title="Charter" content={detail.charter} />}
        </div>

        <footer className="ship-dialog__footer organization-dialog__footer">
          <span>Only information made public by RSI is shown.</span>
          <a href={organization.url} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, organization.url)}>
            View on RSI <ExternalLink size={15} aria-hidden="true" />
          </a>
        </footer>
      </section>
    </div>
  );
}

function OrganizationHero({ organization, detail }: { organization: OrganizationSummary; detail: OrganizationDetail | null }) {
  return (
    <section className="organization-hero" style={detail?.bannerUrl ? { backgroundImage: `linear-gradient(rgba(7, 12, 16, .68), rgba(7, 12, 16, .94)), url("${detail.bannerUrl}")` } : undefined}>
      <OrganizationLogo organization={organization} large />
      <div className="organization-hero__content">
        <div className="ship-detail-badges">
          <span>{organization.archetype}</span>
          <span>{organization.commitment}</span>
          {organization.recruiting === true && <span>Recruiting</span>}
          {organization.rolePlay === true && <span>Role play</span>}
        </div>
        {detail?.activities.length ? <p>{detail.activities.join(' / ')}</p> : <p>Public organization profile</p>}
      </div>
    </section>
  );
}

function OrganizationOverview({ detail }: { detail: OrganizationDetail }) {
  return (
    <section className="ship-detail-section">
      <h3>Overview</h3>
      <div className="organization-stat-grid">
        <Stat icon={<Users size={18} />} label="Reported members" value={detail.memberCount.toLocaleString()} />
        <Stat icon={<Building2 size={18} />} label="Archetype" value={detail.archetype} />
        <Stat icon={<ShieldCheck size={18} />} label="Commitment" value={detail.commitment} />
        <Stat icon={<Globe2 size={18} />} label="Language" value={detail.language || 'Not listed'} />
        <Stat icon={<UserRound size={18} />} label="Recruiting" value={formatBoolean(detail.recruiting)} />
        <Stat icon={<Star size={18} />} label="Role play" value={formatBoolean(detail.rolePlay)} />
      </div>
      <div className="organization-prose">
        <h3>Description</h3>
        <p>{detail.description || 'No public description was provided.'}</p>
      </div>
    </section>
  );
}

function MembersTab({ members, loadedCount, reportedCount, isLoading, error, hasMore, search, affiliation, rank, sort, ranks, onSearch, onAffiliation, onRank, onSort, onLoadMore }: {
  members: OrganizationMember[];
  loadedCount: number;
  reportedCount: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  search: string;
  affiliation: string;
  rank: string;
  sort: string;
  ranks: string[];
  onSearch: (value: string) => void;
  onAffiliation: (value: string) => void;
  onRank: (value: string) => void;
  onSort: (value: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <section className="ship-detail-section organization-members">
      <div className="organization-members__heading">
        <div><h3>Public Member Roster</h3><p>{loadedCount.toLocaleString()} public profiles loaded / {reportedCount.toLocaleString()} members reported by RSI</p></div>
      </div>
      <div className="organization-member-filters">
        <label className="organization-search"><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search loaded members" /></label>
        <FilterSelect label="Affiliation" value={affiliation} onChange={onAffiliation}><option value="all">All affiliations</option><option value="Main">Main</option><option value="Affiliate">Affiliate</option></FilterSelect>
        <FilterSelect label="Rank" value={rank} onChange={onRank}><option value="all">All public ranks</option>{ranks.map((item) => <option key={item} value={item}>{item}</option>)}</FilterSelect>
        <FilterSelect label="Sort" value={sort} onChange={onSort}><option value="handle">Handle</option><option value="rank">Rank</option><option value="affiliation">Affiliation</option></FilterSelect>
      </div>
      {error && <section className="notice notice--error"><Users size={18} aria-hidden="true" /><div><strong>Roster unavailable</strong><span>{error}</span></div></section>}
      <div className="organization-member-list">
        {members.map((member) => (
          <a key={member.handle} href={member.profileUrl} target="_blank" rel="noreferrer" onClick={(event) => handleExternalLink(event, member.profileUrl)} className="organization-member">
            <span className="organization-member__avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <UserRound size={20} />}</span>
            <span><strong>{member.handle}</strong><small>{member.roles.length ? member.roles.join(', ') : 'No public roles'}</small></span>
            <span><small>Rank</small><strong>{member.rank}</strong></span>
            <span><small>Affiliation</small><strong>{member.affiliation}</strong></span>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        ))}
      </div>
      {!isLoading && loadedCount > 0 && members.length === 0 && <p className="ship-empty-price">No loaded members match these filters.</p>}
      {isLoading && <p className="ship-tab-loading">Loading public member profiles...</p>}
      {hasMore && loadedCount > 0 && <div className="load-more"><button type="button" onClick={onLoadMore} disabled={isLoading}><ChevronRight size={17} /> Load more public members</button></div>}
      {!hasMore && loadedCount < reportedCount && <p className="organization-privacy-note">Some members may be hidden or have redacted affiliations. RSI's reported total can be larger than its public roster.</p>}
    </section>
  );
}

function TextTab({ title, content }: { title: string; content: string }) {
  return <section className="ship-detail-section organization-prose"><h3>{title}</h3><p>{content || `No public ${title.toLowerCase()} was provided.`}</p></section>;
}

function OrganizationLogo({ organization, large = false }: { organization: OrganizationSummary; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`organization-logo ${large ? 'organization-logo--large' : ''}`}>
      {organization.logoUrl && !failed ? <img src={organization.logoUrl} alt="" onError={() => setFailed(true)} /> : <Building2 size={large ? 38 : 23} aria-hidden="true" />}
    </span>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="ship-filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="ship-spec"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function mergeOrganizations(current: OrganizationSummary[], incoming: OrganizationSummary[]): OrganizationSummary[] {
  const merged = new Map(current.map((organization) => [organization.sid, organization]));
  incoming.forEach((organization) => merged.set(organization.sid, organization));
  return [...merged.values()];
}

function mergeMembers(current: OrganizationMember[], incoming: OrganizationMember[]): OrganizationMember[] {
  const merged = new Map(current.map((member) => [member.handle.toLowerCase(), member]));
  incoming.forEach((member) => merged.set(member.handle.toLowerCase(), member));
  return [...merged.values()];
}

function compareOrganizationsByMembers(left: OrganizationSummary, right: OrganizationSummary): number {
  return right.memberCount - left.memberCount || left.name.localeCompare(right.name);
}

function matchesMemberRange(memberCount: number, range: MemberRange): boolean {
  if (range === '1-10') return memberCount >= 1 && memberCount <= 10;
  if (range === '11-50') return memberCount >= 11 && memberCount <= 50;
  if (range === '51-200') return memberCount >= 51 && memberCount <= 200;
  if (range === '201+') return memberCount >= 201;
  return true;
}

function formatBoolean(value: boolean | null): string {
  return value === null ? 'Not listed' : value ? 'Yes' : 'No';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRelativeTime(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!window.__TAURI_INTERNALS__) return;
  event.preventDefault();
  void openExternalUrl(url);
}
