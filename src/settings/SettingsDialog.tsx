import { Bell, Clock3, Download, Power, RefreshCw, Settings, X } from 'lucide-react';
import { useEffect } from 'react';
import type { AppUpdaterState } from '../updates/useAppUpdater';
import type { AppSettings, NotificationPermissionState } from './types';

interface SettingsDialogProps {
  settings: AppSettings;
  notificationPermission: NotificationPermissionState;
  error: string | null;
  onClose: () => void;
  onUpdate: (updates: Partial<AppSettings>) => void;
  onSetNotifications: (enabled: boolean) => Promise<void>;
  onSetLaunchAtStartup: (enabled: boolean) => Promise<void>;
  onTestNotification: () => Promise<void>;
  updater: AppUpdaterState;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
}

export function SettingsDialog({
  settings,
  notificationPermission,
  error,
  onClose,
  onUpdate,
  onSetNotifications,
  onSetLaunchAtStartup,
  onTestNotification,
  updater,
  onCheckForUpdates,
  onInstallUpdate
}: SettingsDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <div>
            <p className="eyebrow">Application</p>
            <h2 id="settings-title"><Settings size={21} aria-hidden="true" /> Settings</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-group">
          <h3><Power size={17} aria-hidden="true" /> Background</h3>
          <ToggleRow
            label="Keep running in system tray"
            checked={settings.keepRunningInTray}
            onChange={(checked) => onUpdate({ keepRunningInTray: checked })}
          />
          <ToggleRow
            label="Launch at startup"
            disabled={import.meta.env.VITE_STORE_BUILD === 'true'}
            checked={settings.launchAtStartup}
            onChange={(checked) => void onSetLaunchAtStartup(checked)}
          />
        </div>

        <div className="settings-group">
          <h3><Bell size={17} aria-hidden="true" /> Notifications</h3>
          <ToggleRow
            label="System notifications"
            checked={settings.notificationsEnabled}
            onChange={(checked) => void onSetNotifications(checked)}
          />
          <div className="settings-subgroup" aria-disabled={!settings.notificationsEnabled}>
            <ToggleRow
              label="New announcements"
              checked={settings.notifyAnnouncements}
              disabled={!settings.notificationsEnabled}
              onChange={(checked) => onUpdate({ notifyAnnouncements: checked })}
            />
            <ToggleRow
              label="Server status changes"
              checked={settings.notifyStatus}
              disabled={!settings.notificationsEnabled}
              onChange={(checked) => onUpdate({ notifyStatus: checked })}
            />
            <ToggleRow
              label="New patch notes"
              checked={settings.notifyPatchNotes}
              disabled={!settings.notificationsEnabled}
              onChange={(checked) => onUpdate({ notifyPatchNotes: checked })}
            />
            <ToggleRow
              label="New RSI news"
              checked={settings.notifyNews}
              disabled={!settings.notificationsEnabled}
              onChange={(checked) => onUpdate({ notifyNews: checked })}
            />
            <ToggleRow
              label="SC Companion updates"
              checked={settings.notifyAppUpdates}
              disabled={!settings.notificationsEnabled || import.meta.env.VITE_STORE_BUILD === 'true'}
              onChange={(checked) => onUpdate({ notifyAppUpdates: checked })}
            />
          </div>
          <button
            type="button"
            className="settings-command"
            disabled={!settings.notificationsEnabled}
            onClick={() => void onTestNotification()}
          >
            <Bell size={15} aria-hidden="true" />
            Send test notification
          </button>
          {notificationPermission === 'denied' && (
            <p className="settings-message settings-message--error">Notification permission is blocked by the operating system.</p>
          )}
        </div>

        <div className="settings-group">
          <h3><Clock3 size={17} aria-hidden="true" /> Refresh intervals</h3>
          <SelectRow
            label="Server status"
            value={settings.statusRefreshMinutes}
            options={[2, 5, 10, 15]}
            onChange={(value) => onUpdate({ statusRefreshMinutes: value })}
          />
          <SelectRow
            label="Announcements, patch notes, and news"
            value={settings.contentRefreshMinutes}
            options={[5, 10, 15, 30]}
            onChange={(value) => onUpdate({ contentRefreshMinutes: value })}
          />
        </div>

        <div className="settings-group">
          <h3><Download size={17} aria-hidden="true" /> Application updates</h3>
          {import.meta.env.VITE_STORE_BUILD === 'true' && <p className="settings-message">Updates are managed by Microsoft Store.</p>}
          <div className="update-version-row">
            <span>Installed version</span>
            <strong>{updater.currentVersion}</strong>
          </div>
          {updater.status === 'available' && (
            <p className="settings-message">Version {updater.availableVersion} is ready to install.</p>
          )}
          {updater.status === 'up-to-date' && (
            <p className="settings-message">SC Companion is up to date.</p>
          )}
          {updater.status === 'error' && updater.error && (
            <p className="settings-message settings-message--error">{updater.error}</p>
          )}
          <button
            type="button"
            className="settings-command"
            disabled={updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'installing'}
            hidden={import.meta.env.VITE_STORE_BUILD === 'true'}
            onClick={() => void (updater.status === 'available' ? onInstallUpdate() : onCheckForUpdates())}
          >
            {updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'installing'
              ? <RefreshCw size={15} className="spin" aria-hidden="true" />
              : updater.status === 'available'
                ? <Download size={15} aria-hidden="true" />
                : <RefreshCw size={15} aria-hidden="true" />}
            {updater.status === 'available'
              ? 'Install update'
              : updater.status === 'checking'
                ? 'Checking...'
                : updater.status === 'downloading'
                  ? `Downloading${updater.progress === null ? '...' : ` ${updater.progress}%`}`
                  : updater.status === 'installing'
                    ? 'Installing...'
                    : 'Check for updates'}
          </button>
        </div>

        {error && <p className="settings-message settings-message--error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`setting-row${disabled ? ' setting-row--disabled' : ''}`}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="toggle" aria-hidden="true"><span /></span>
    </label>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-row setting-row--select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.currentTarget.value))}>
        {options.map((minutes) => <option value={minutes} key={minutes}>{minutes} minutes</option>)}
      </select>
    </label>
  );
}
