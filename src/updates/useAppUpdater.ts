import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const NOTIFIED_VERSION_KEY = 'sc-companion:last-notified-app-version';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'up-to-date'
  | 'error';

export interface AppUpdaterState {
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  status: AppUpdateStatus;
  progress: number | null;
  error: string | null;
  dismissed: boolean;
}

export function useAppUpdater(notificationsEnabled: boolean) {
  const updateRef = useRef<Update | null>(null);
  const checkInProgress = useRef(false);
  const [state, setState] = useState<AppUpdaterState>({
    currentVersion: '0.29.1',
    availableVersion: null,
    releaseNotes: null,
    status: 'idle',
    progress: null,
    error: null,
    dismissed: false
  });

  const checkForUpdates = useCallback(async (manual = true) => {
    if (!window.__TAURI_INTERNALS__ || checkInProgress.current) return;
    checkInProgress.current = true;
    setState((current) => ({
      ...current,
      status: 'checking',
      error: null,
      dismissed: manual ? false : current.dismissed
    }));

    try {
      const update = await check({ timeout: 30_000 });
      if (!update) {
        setState((current) => ({ ...current, status: manual ? 'up-to-date' : 'idle' }));
        return;
      }

      if (updateRef.current && updateRef.current !== update) {
        await updateRef.current.close().catch(() => undefined);
      }
      updateRef.current = update;
      setState((current) => ({
        ...current,
        availableVersion: update.version,
        releaseNotes: update.body ?? null,
        status: 'available'
      }));

      const lastNotified = window.localStorage.getItem(NOTIFIED_VERSION_KEY);
      if (notificationsEnabled && lastNotified !== update.version) {
        sendNotification({
          title: 'SC Companion update available',
          body: `Version ${update.version} is ready to install.`
        });
        window.localStorage.setItem(NOTIFIED_VERSION_KEY, update.version);
      }
    } catch (updateError) {
      setState((current) => ({
        ...current,
        status: manual ? 'error' : 'idle',
        error: manual ? formatUpdateError(updateError) : null
      }));
    } finally {
      checkInProgress.current = false;
    }
  }, [notificationsEnabled]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || state.status === 'downloading' || state.status === 'installing') return;

    let downloaded = 0;
    let total: number | undefined;
    setState((current) => ({ ...current, status: 'downloading', progress: 0, error: null }));
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState((current) => ({
            ...current,
            progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null
          }));
        } else {
          setState((current) => ({ ...current, status: 'installing', progress: 100 }));
        }
      });
      await relaunch();
    } catch (updateError) {
      setState((current) => ({
        ...current,
        status: 'error',
        progress: null,
        error: formatUpdateError(updateError)
      }));
    }
  }, [state.status]);

  const dismissUpdate = useCallback(() => {
    setState((current) => ({ ...current, dismissed: true }));
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    void getVersion().then((version) => {
      setState((current) => ({ ...current, currentVersion: version }));
    });

    const initialCheck = window.setTimeout(() => void checkForUpdates(false), 8_000);
    const interval = window.setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  return { state, checkForUpdates, installUpdate, dismissUpdate };
}

function formatUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/404|not found/i.test(message)) return 'No published SC Companion release is available yet.';
  return message || 'Could not check for updates.';
}
