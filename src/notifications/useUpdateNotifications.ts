import { sendNotification } from '@tauri-apps/plugin-notification';
import { useEffect, useRef } from 'react';
import type { AnnouncementsSnapshot } from '../announcements/types';
import type { NewsSnapshot } from '../news/types';
import type { PatchNotesSnapshot } from '../patchNotes/types';
import type { AppSettings } from '../settings/types';
import type { StatusSnapshot } from '../status/types';

interface UpdateNotificationSources {
  settings: AppSettings;
  announcements: AnnouncementsSnapshot | null;
  status: StatusSnapshot | null;
  patchNotes: PatchNotesSnapshot | null;
  news: NewsSnapshot | null;
}

export function useUpdateNotifications({ settings, announcements, status, patchNotes, news }: UpdateNotificationSources): void {
  const previousStatus = useRef<string | null>(null);
  const knownAnnouncements = useRef<Set<string> | null>(null);
  const knownPatchNotes = useRef<Set<string> | null>(null);
  const knownNews = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!announcements) return;
    const currentIds = announcements.announcements.map((item) => item.id);
    const candidates = findNewLeadingItems(announcements.announcements, knownAnnouncements.current, (item) => item.id);
    knownAnnouncements.current = new Set([...(knownAnnouncements.current ?? []), ...currentIds]);

    if (candidates.length > 0 && canNotify(settings, settings.notifyAnnouncements)) {
      notify(
        candidates.length === 1 ? 'New Star Citizen announcement' : `${candidates.length} new Star Citizen announcements`,
        candidates.length === 1 ? candidates[0].title : candidates.map((item) => item.title).slice(0, 3).join('\n')
      );
    }
  }, [announcements, settings]);

  useEffect(() => {
    if (!status?.currentStatus) return;
    const current = `${status.currentStatus.level}:${status.currentStatus.message}`;
    const previous = previousStatus.current;
    previousStatus.current = current;

    if (previous && previous !== current && canNotify(settings, settings.notifyStatus)) {
      notify('Star Citizen service status', status.currentStatus.message);
    }
  }, [settings, status]);

  useEffect(() => {
    if (!patchNotes) return;
    const currentIds = patchNotes.notes.map((note) => note.id);
    const candidates = findNewLeadingItems(patchNotes.notes, knownPatchNotes.current, (note) => note.id);
    knownPatchNotes.current = new Set([...(knownPatchNotes.current ?? []), ...currentIds]);

    if (candidates.length > 0 && canNotify(settings, settings.notifyPatchNotes)) {
      notify(
        candidates.length === 1 ? 'New Star Citizen patch notes' : `${candidates.length} new Star Citizen patch notes`,
        candidates.length === 1 ? candidates[0].title : candidates.map((note) => note.title).slice(0, 3).join('\n')
      );
    }
  }, [patchNotes, settings]);

  useEffect(() => {
    if (!news) return;
    const currentIds = news.articles.map((article) => article.id);
    const candidates = findNewLeadingItems(news.articles, knownNews.current, (article) => article.id);
    knownNews.current = new Set([...(knownNews.current ?? []), ...currentIds]);

    if (candidates.length > 0 && canNotify(settings, settings.notifyNews)) {
      notify(
        candidates.length === 1 ? 'New RSI Comm-Link article' : `${candidates.length} new RSI Comm-Link articles`,
        candidates.length === 1 ? candidates[0].title : candidates.map((article) => article.title).slice(0, 3).join('\n')
      );
    }
  }, [news, settings]);
}

function findNewLeadingItems<T>(items: T[], known: Set<string> | null, getId: (item: T) => string): T[] {
  if (!known) return [];
  const firstKnownIndex = items.findIndex((item) => known.has(getId(item)));
  if (firstKnownIndex <= 0) return [];
  return items.slice(0, firstKnownIndex).filter((item) => !known.has(getId(item)));
}

function canNotify(settings: AppSettings, categoryEnabled: boolean): boolean {
  return Boolean(window.__TAURI_INTERNALS__ && settings.notificationsEnabled && categoryEnabled);
}

function notify(title: string, body: string): void {
  try {
    sendNotification({ title, body });
  } catch (error) {
    console.error('Could not send a system notification.', error);
  }
}
