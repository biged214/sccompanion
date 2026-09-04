export interface AppSettings {
  keepRunningInTray: boolean;
  notificationsEnabled: boolean;
  notifyAnnouncements: boolean;
  notifyStatus: boolean;
  notifyPatchNotes: boolean;
  notifyNews: boolean;
  notifyAppUpdates: boolean;
  launchAtStartup: boolean;
  statusRefreshMinutes: number;
  contentRefreshMinutes: number;
}

export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable';
