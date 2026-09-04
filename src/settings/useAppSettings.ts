import { invoke } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, NotificationPermissionState } from './types';

const CACHE_KEY = 'star-citizen-status:settings';
const DEFAULT_SETTINGS: AppSettings = {
  keepRunningInTray: true,
  notificationsEnabled: true,
  notifyAnnouncements: true,
  notifyStatus: true,
  notifyPatchNotes: true,
  notifyNews: false,
  notifyAppUpdates: true,
  launchAtStartup: false,
  statusRefreshMinutes: 5,
  contentRefreshMinutes: 10
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    window.__TAURI_INTERNALS__ ? 'unknown' : 'unavailable'
  );
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...updates };
      saveSettings(next);
      return next;
    });
    setError(null);
  }, []);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled || !window.__TAURI_INTERNALS__) {
      updateSettings({ notificationsEnabled: enabled });
      return;
    }

    try {
      const granted = await ensureNotificationPermission();
      setNotificationPermission(granted ? 'granted' : 'denied');
      updateSettings({ notificationsEnabled: granted });
      if (!granted) setError('Windows or Linux did not grant notification permission.');
    } catch (permissionError) {
      updateSettings({ notificationsEnabled: false });
      setError(permissionError instanceof Error ? permissionError.message : 'Could not enable notifications.');
    }
  }, [updateSettings]);

  const setLaunchAtStartup = useCallback(async (enabled: boolean) => {
    if (!window.__TAURI_INTERNALS__) {
      updateSettings({ launchAtStartup: enabled });
      return;
    }

    try {
      if (enabled) await enable();
      else await disable();
      updateSettings({ launchAtStartup: enabled });
    } catch (autostartError) {
      setError(autostartError instanceof Error ? autostartError.message : 'Could not update startup behavior.');
    }
  }, [updateSettings]);

  const sendTestNotification = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) return;
    try {
      const granted = await ensureNotificationPermission();
      setNotificationPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        setError('Windows or Linux did not grant notification permission.');
        return;
      }
      sendNotification({
        title: 'SC Companion',
        body: 'System notifications are working.'
      });
      setError(null);
    } catch (notificationError) {
      setError(notificationError instanceof Error ? notificationError.message : 'Could not send the test notification.');
    }
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;

    void invoke('set_close_to_tray', { enabled: settings.keepRunningInTray });
  }, [settings.keepRunningInTray]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;

    void isEnabled()
      .then((enabled) => updateSettings({ launchAtStartup: enabled }))
      .catch(() => setError('Could not read the launch-at-startup setting.'));

    if (settings.notificationsEnabled) {
      void ensureNotificationPermission()
        .then((granted) => {
          setNotificationPermission(granted ? 'granted' : 'denied');
          if (!granted) updateSettings({ notificationsEnabled: false });
        })
        .catch(() => {
          setNotificationPermission('denied');
          updateSettings({ notificationsEnabled: false });
        });
    } else {
      void isPermissionGranted()
        .then((granted) => setNotificationPermission(granted ? 'granted' : 'unknown'))
        .catch(() => setNotificationPermission('unknown'));
    }
  }, []);

  return {
    settings,
    notificationPermission,
    error,
    updateSettings,
    setNotificationsEnabled,
    setLaunchAtStartup,
    sendTestNotification
  };
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings): void {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
}
