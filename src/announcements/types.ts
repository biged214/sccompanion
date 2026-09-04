export interface Announcement {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  author: string;
  replies: number;
  views: number;
  votes: number;
}

export interface AnnouncementsSnapshot {
  fetchedAt: string;
  announcements: Announcement[];
}

export interface AnnouncementsState {
  snapshot: AnnouncementsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
