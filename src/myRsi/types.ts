export interface PublicRsiOrganization {
  name: string;
  sid: string;
  rank: string;
  logoUrl: string | null;
  url: string;
}

export interface PublicRsiProfile {
  handle: string;
  displayName: string;
  citizenRecord: string;
  avatarUrl: string | null;
  title: string;
  enlistedAt: string;
  fluency: string[];
  website: string;
  bio: string;
  mainOrganization: PublicRsiOrganization | null;
  profileUrl: string;
}
