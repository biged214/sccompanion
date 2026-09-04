export type PatchChannel = 'LIVE' | 'PTU' | 'Hotfix' | 'Release';

export interface PatchNote {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  author: string;
  replies: number;
  views: number;
  votes: number;
  channel: PatchChannel;
}

export interface PatchNotesSnapshot {
  fetchedAt: string;
  notes: PatchNote[];
}

export interface PatchNotesState {
  snapshot: PatchNotesSnapshot | null;
  isLoading: boolean;
  error: string | null;
  usingCache: boolean;
}
