import { t } from '../i18n';
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
    ? t("Installing update...")
    : state.status === 'downloading'
      ? t("Downloading{{v0}}", { v0: state.progress === null ? '...' : ` ${state.progress}%` })
      : t("SC Companion {{v0}} is available.", { v0: state.availableVersion ?? '' });

  return (
    <section className="app-update-banner" aria-live="polite">
      <div className="app-update-banner__message">
        <Download size={19} aria-hidden="true" />
        <div>
          <strong>{message}</strong>
          {state.status === 'available' && <span>{t("Install it now without downloading a separate installer.")}</span>}
        </div>
      </div>
      <div className="app-update-banner__actions">
        <button type="button" className="settings-command" disabled={working} onClick={() => void onInstall()}>
          {working ? <RefreshCw size={15} className="spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          {working ? t("Please wait") : t("Install update")}
        </button>
        {!working && (
          <button type="button" className="icon-button" aria-label={t("Dismiss update")} title={t("Later")} onClick={onDismiss}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
