import { Building2, ExternalLink, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { openExternalUrl } from '../platform/openExternalUrl';
import { usePersistentState } from '../state/usePersistentState';
import { fetchPublicRsiProfile, RSI_ACCOUNT_DASHBOARD_URL } from './myRsiService';
import type { PublicRsiProfile } from './types';

export function MyRsi() {
  const [savedHandle, setSavedHandle] = usePersistentState('my-rsi.public-handle', '');
  const [handle, setHandle] = useState(savedHandle);
  const [profile, setProfile] = useState<PublicRsiProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequestId = useRef(0);

  async function loadProfile(nextHandle: string) {
    const requestId = ++activeRequestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextProfile = await fetchPublicRsiProfile(nextHandle);
      if (requestId !== activeRequestId.current) return;
      setProfile(nextProfile);
      setSavedHandle(nextProfile.handle);
      setHandle(nextProfile.handle);
    } catch (loadError) {
      if (requestId !== activeRequestId.current) return;
      setProfile(null);
      setError(readErrorMessage(loadError));
    } finally {
      if (requestId === activeRequestId.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (savedHandle) void loadProfile(savedHandle);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void loadProfile(handle);
  }

  return (
    <section className="my-rsi-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Public Citizen Profile</p>
          <h2>My RSI</h2>
        </div>
        <p>Connect a public RSI handle here. Private account management stays on the official RSI website.</p>
      </div>

      <div className="my-rsi-actions">
        <form className="my-rsi-search" onSubmit={handleSubmit}>
          <label htmlFor="rsi-handle">Public RSI handle</label>
          <div>
            <input
              id="rsi-handle"
              value={handle}
              onChange={(event) => {
                activeRequestId.current += 1;
                setIsLoading(false);
                setHandle(event.currentTarget.value);
              }}
              placeholder="Enter your handle"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={isLoading || !handle.trim()}>
              {isLoading ? <RefreshCw className="spin" size={17} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
              {profile ? 'Refresh profile' : 'Load profile'}
            </button>
          </div>
        </form>

        <a
          className="my-rsi-dashboard-link"
          href={RSI_ACCOUNT_DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          onClick={handleExternalLink}
        >
          <ExternalLink size={18} aria-hidden="true" />
          <span><strong>Open RSI Account Dashboard</strong><small>Sign in and manage private account details on RSI</small></span>
        </a>
      </div>

      <div className="my-rsi-security-note">
        <ShieldCheck size={19} aria-hidden="true" />
        <span>SC Companion only reads the public citizen dossier. Never enter an RSI password or authentication code in this app.</span>
      </div>

      {error && <div className="notice notice--error" role="alert"><span>{error}</span></div>}

      {profile && (
        <article className="rsi-profile">
          <header className="rsi-profile__header">
            <div className="rsi-profile__avatar">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <UserRound size={38} aria-hidden="true" />}
            </div>
            <div>
              <p className="eyebrow">{profile.citizenRecord}</p>
              <h3>{profile.displayName}</h3>
              <span>@{profile.handle}</span>
            </div>
            <a href={profile.profileUrl} target="_blank" rel="noreferrer" onClick={handleExternalLink}>
              View public dossier <ExternalLink size={15} aria-hidden="true" />
            </a>
          </header>

          <div className="rsi-profile__facts">
            <ProfileFact label="Title" value={profile.title} />
            <ProfileFact label="Enlisted" value={profile.enlistedAt} />
            <ProfileFact label="Languages" value={profile.fluency.join(', ') || 'Not public'} />
            <ProfileFact label="Website" value={profile.website || 'Not listed'} />
          </div>

          {profile.mainOrganization && (
            <a className="rsi-profile__organization" href={profile.mainOrganization.url} target="_blank" rel="noreferrer" onClick={handleExternalLink}>
              <span className="rsi-profile__organization-logo">
                {profile.mainOrganization.logoUrl ? <img src={profile.mainOrganization.logoUrl} alt="" /> : <Building2 size={24} aria-hidden="true" />}
              </span>
              <span><small>Main organization</small><strong>{profile.mainOrganization.name}</strong><span>{profile.mainOrganization.sid} · {profile.mainOrganization.rank}</span></span>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}

          {profile.bio && <div className="rsi-profile__bio"><small>Bio</small><p>{profile.bio}</p></div>}
        </article>
      )}
    </section>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function handleExternalLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (!window.__TAURI_INTERNALS__) return;
  event.preventDefault();
  void openExternalUrl(event.currentTarget.href);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message');
    if (typeof message === 'string' && message) return message;
  }
  return 'Could not load the public RSI profile.';
}
