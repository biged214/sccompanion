import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AnnouncementsSnapshot } from '../announcements/types';
import type { NewsSnapshot } from '../news/types';
import type { PatchNotesSnapshot } from '../patchNotes/types';
import type { StatusSnapshot } from '../status/types';

type UnreadCategory = 'announcements' | 'status' | 'patch-notes' | 'news';

interface TrackedItem {
  id: string;
  publishedAt: string;
}

interface CategoryReadState {
  initialized: boolean;
  knownThrough: number;
  knownIds: string[];
  unreadIds: string[];
}

type UnreadState = Record<UnreadCategory, CategoryReadState>;

const STORAGE_KEY = 'sc-companion:unread-updates:v1';
const MAX_KNOWN_IDS = 500;

export function useUnreadUpdates({
  announcements,
  status,
  patchNotes,
  news
}: {
  announcements: AnnouncementsSnapshot | null;
  status: StatusSnapshot | null;
  patchNotes: PatchNotesSnapshot | null;
  news: NewsSnapshot | null;
}) {
  const [state, setState] = useState<UnreadState>(loadState);

  useEffect(() => observeItems('announcements', announcements?.announcements ?? [], setState), [announcements]);
  useEffect(() => observeItems('status', status?.updates ?? [], setState), [status]);
  useEffect(() => observeItems('patch-notes', patchNotes?.notes ?? [], setState), [patchNotes]);
  useEffect(() => observeItems('news', news?.articles ?? [], setState), [news]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Unread state remains available for the current app session.
    }
  }, [state]);

  const markRead = useCallback((category: UnreadCategory, id: string) => {
    setState((current) => {
      const categoryState = current[category];
      if (!categoryState.unreadIds.includes(id)) return current;
      return {
        ...current,
        [category]: {
          ...categoryState,
          unreadIds: categoryState.unreadIds.filter((unreadId) => unreadId !== id)
        }
      };
    });
  }, []);

  const isUnread = useCallback(
    (category: UnreadCategory, id: string) => state[category].unreadIds.includes(id),
    [state]
  );

  return {
    counts: {
      announcements: state.announcements.unreadIds.length,
      status: state.status.unreadIds.length,
      patchNotes: state['patch-notes'].unreadIds.length,
      news: state.news.unreadIds.length
    },
    isUnread,
    markRead
  };
}

function observeItems(
  category: UnreadCategory,
  items: TrackedItem[],
  setState: Dispatch<SetStateAction<UnreadState>>
): void {
  if (items.length === 0) return;
  setState((current) => {
    const categoryState = current[category];
    const ids = items.map((item) => item.id);
    const latestTimestamp = Math.max(...items.map((item) => parseTimestamp(item.publishedAt)));

    if (!categoryState.initialized) {
      return {
        ...current,
        [category]: {
          initialized: true,
          knownThrough: latestTimestamp,
          knownIds: ids.slice(0, MAX_KNOWN_IDS),
          unreadIds: []
        }
      };
    }

    const knownIds = new Set(categoryState.knownIds);
    const newUnreadIds = items
      .filter((item) => parseTimestamp(item.publishedAt) >= categoryState.knownThrough && !knownIds.has(item.id))
      .map((item) => item.id);
    const nextKnownIds = [...new Set([...ids, ...categoryState.knownIds])].slice(0, MAX_KNOWN_IDS);
    const nextUnreadIds = [...new Set([...newUnreadIds, ...categoryState.unreadIds])];
    const nextKnownThrough = Math.max(categoryState.knownThrough, latestTimestamp);

    if (
      newUnreadIds.length === 0 &&
      nextKnownThrough === categoryState.knownThrough &&
      nextKnownIds.length === categoryState.knownIds.length
    ) {
      return current;
    }

    return {
      ...current,
      [category]: {
        initialized: true,
        knownThrough: nextKnownThrough,
        knownIds: nextKnownIds,
        unreadIds: nextUnreadIds
      }
    };
  });
}

function loadState(): UnreadState {
  const empty = createEmptyState();
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<UnreadState> | null;
    if (!stored) return empty;
    return {
      announcements: normalizeCategoryState(stored.announcements),
      status: normalizeCategoryState(stored.status),
      'patch-notes': normalizeCategoryState(stored['patch-notes']),
      news: normalizeCategoryState(stored.news)
    };
  } catch {
    return empty;
  }
}

function createEmptyState(): UnreadState {
  return {
    announcements: createEmptyCategoryState(),
    status: createEmptyCategoryState(),
    'patch-notes': createEmptyCategoryState(),
    news: createEmptyCategoryState()
  };
}

function createEmptyCategoryState(): CategoryReadState {
  return { initialized: false, knownThrough: 0, knownIds: [], unreadIds: [] };
}

function normalizeCategoryState(value: CategoryReadState | undefined): CategoryReadState {
  if (!value || !Array.isArray(value.knownIds) || !Array.isArray(value.unreadIds)) return createEmptyCategoryState();
  return {
    initialized: Boolean(value.initialized),
    knownThrough: Number.isFinite(value.knownThrough) ? value.knownThrough : 0,
    knownIds: value.knownIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_KNOWN_IDS),
    unreadIds: value.unreadIds.filter((id): id is string => typeof id === 'string')
  };
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
