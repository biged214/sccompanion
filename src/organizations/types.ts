export interface OrganizationSearchFilters {
  search: string;
  archetype: string;
  commitment: string;
  recruiting: string;
  rolePlay: string;
}
export interface OrganizationSummary {
  sid: string;
  name: string;
  logoUrl: string | null;
  archetype: string;
  language: string;
  commitment: string;
  recruiting: boolean | null;
  rolePlay: boolean | null;
  memberCount: number;
  url: string;
}

export interface OrganizationSearchPage {
  fetchedAt: string;
  page: number;
  organizations: OrganizationSummary[];
  hasMore: boolean;
}

export interface OrganizationDetail extends OrganizationSummary {
  bannerUrl: string | null;
  coverUrl: string | null;
  activities: string[];
  description: string;
  history: string;
  manifesto: string;
  charter: string;
}

export interface OrganizationMember {
  handle: string;
  avatarUrl: string | null;
  rank: string;
  roles: string[];
  affiliation: 'Main' | 'Affiliate';
  profileUrl: string;
}

export interface OrganizationMembersPage {
  page: number;
  members: OrganizationMember[];
  hasMore: boolean;
}
