export type ServiceLevel = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

export interface StatusUpdate {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  link: string;
  category?: string;
  level: ServiceLevel;
}

export interface CurrentServiceStatus {
  level: ServiceLevel;
  message: string;
  services: Array<{
    name: string;
    level: ServiceLevel;
    label: string;
  }>;
}

export interface StatusSnapshot {
  feedTitle: string;
  feedDescription: string;
  fetchedAt: string;
  currentStatus?: CurrentServiceStatus;
  updates: StatusUpdate[];
}

export interface StatusState {
  snapshot: StatusSnapshot | null;
  isLoading: boolean;
  error: string | null;
  lastRefreshStartedAt: string | null;
  usingCache: boolean;
}
