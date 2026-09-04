import { Download, RefreshCw, X } from 'lucide-react';
import type { AppUpdaterState } from './useAppUpdater';

interface UpdateBannerProps {
  state: AppUpdaterState;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
}

export function UpdateBanner({ state, onInstall, onDismiss }: UpdateBannerProps) {
  if (state.dismissed || !['available', 'downloading', 'installing'].includes(state.status)) return null;

  const working = state.status === 'downloading' || state.status === 'installing';
  const message = state.status === 'installing'
    ? 'Installing update...'
    : state.status === 'downloading'
      ? `Downloading${state.progress === null ? '...' : ` ${state.progress}%`}`
      : `SC Companion ${state.availableVersion} is available.`;

  return (
    <section className="app-update-banner" aria-live="polite">
      <div className="app-update-banner__message">
        <Download size={19} aria-hidden="true" />
        <div>
          <strong>{message}</strong>
          {state.status === 'available' && <span>Install it now without downloading a separate installer.</span>}
        </div>
      </div>
      <div className="app-update-banner__actions">
        <button type="button" className="settings-command" disabled={working} onClick={() => void onInstall()}>
          {working ? <RefreshCw size={15} className="spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          {working ? 'Please wait' : 'Install update'}
        </button>
        {!working && (
          <button type="button" className="icon-button" aria-label="Dismiss update" title="Later" onClick={onDismiss}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
