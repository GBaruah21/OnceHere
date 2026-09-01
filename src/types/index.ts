/**
 * Core Domain Types for OnceHere Multi-Tenant Platform
 */

export type ArchiveType =
  | 'school'
  | 'college'
  | 'university'
  | 'workplace'
  | 'team'
  | 'trip'
  | 'reunion'
  | 'club'
  | 'custom';

export type ThemeId =
  | 'midnight-cinema'
  | 'heritage-noir'
  | 'aurora-glass'
  | 'paper-polaroids'
  | 'neon-afterglow'
  | 'forest-chronicle';

export type Visibility = 'public' | 'unlisted' | 'private';

export type ContributionMode = 'owner-only' | 'pin-protected' | 'open';

export type DeploymentStatus = 'draft' | 'deployed' | 'unpublished';

export type DomainStatus = 'pending' | 'verified' | 'misconfigured' | 'failed';

export type SectionType =
  | 'hero'
  | 'timeline'
  | 'members'
  | 'media-vault'
  | 'memory-wall'
  | 'closing';

export type TimelineLayout =
  | 'vertical-cinematic'
  | 'horizontal-slider'
  | 'stacked-cards'
  | 'chapter-story';

export type WallCardStyle = 'classic-paper' | 'polaroid' | 'sticky-yellow' | 'sticky-rose' | 'sticky-cyan' | 'neon-glow';

export interface MediaNote {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface ArchiveSettings {
  allowAnonymousWall: boolean;
  requireWallApproval: boolean;
  allowMediaDownloads: boolean;
  allowMemberMessages: boolean;
  allowPublicSearch: boolean;
  enableProfanityFilter: boolean;
  enableBackgroundMusic: boolean;
  backgroundMusicUrl?: string;
  heroButtonText?: string;
  heroSecondaryText?: string;
  customClosingTitle?: string;
  customClosingNote?: string;
  groupLogoUrl?: string;
  fontPreset?: string;
  fontPresetId?: string;
}

export interface Archive {
  id: string;
  workspaceSlug: string; // Internal temporary workspace identifier (e.g. ws-abc123xyz)
  slug: string;          // Public URL slug (e.g. marys-convent-2026)
  customDomain?: string;
  domainStatus: DomainStatus;
  title: string;
  organizationName: string;
  subtitle?: string;
  archiveType: ArchiveType;
  startYear: number;
  endYear: number;
  batchLabel?: string;
  approxPeopleCount?: number;
  membersCount?: number;
  mediaCount?: number;
  themeId: ThemeId;
  visibility: Visibility;
  contributionMode: ContributionMode;
  editorPinHash?: string;
  viewerPinHash?: string;
  recoveryKeyHash: string;
  deploymentStatus: DeploymentStatus;
  /** Platform-owner control that removes a public archive from Explore without unpublishing it. */
  isHiddenFromExplore?: boolean;
  settings: ArchiveSettings;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Section {
  id: string;
  archiveId: string;
  stableType: SectionType;
  navigationLabel: string;
  displayTitle: string;
  description?: string;
  layout?: string;
  position: number;
  isVisible: boolean;
  settings?: Record<string, any>;
}

export interface TimelineEvent {
  id: string;
  archiveId: string;
  sectionId?: string;
  title: string;
  description: string;
  eventDate?: string;
  yearLabel: string;
  location?: string;
  icon?: string;
  mediaUrl?: string;
  tags: string[];
  position: number;
  isDraft: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  archiveId: string;
  name: string;
  nickname?: string;
  imageUrl?: string;
  groupLabel?: string; // department, branch, role, squad
  quote?: string;
  memory?: string;
  socialLinks?: {
    instagram?: string;
    linkedin?: string;
    twitter?: string;
    email?: string;
  };
  tags: string[];
  yearsActive?: string;
  position: number;
  createdAt: string;
}

export interface MemberMessage {
  id: string;
  archiveId: string;
  memberId: string;
  authorName: string;
  text: string;
  visibility: 'public' | 'private';
  isHidden: boolean;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  archiveId: string;
  uploaderSessionId?: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  altText?: string;
  eventDate?: string;
  albumId?: string;
  tags: string[];
  notes?: MediaNote[];
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
}

export interface Album {
  id: string;
  archiveId: string;
  name: string;
  description?: string;
  coverMediaUrl?: string;
  position: number;
}

export interface WallPost {
  id: string;
  archiveId: string;
  authorName: string;
  authorRole?: string;
  text: string;
  imageUrl?: string;
  cardStyle: WallCardStyle;
  isPinned: boolean;
  isApproved: boolean;
  isHidden?: boolean;
  likesCount: number;
  createdAt: string;
}

export interface Revision {
  id: string;
  archiveId: string;
  entityType: 'archive' | 'sections' | 'timeline' | 'members' | 'media' | 'wall' | 'full';
  summary: string;
  actorType: 'owner' | 'contributor';
  snapshotData: any;
  createdAt: string;
}

export interface UserSession {
  archiveId: string;
  role: 'owner' | 'contributor' | 'viewer';
  token: string;
  expiresAt: string;
}

export interface DomainCheckResult {
  slug: string;
  available: boolean;
  reason?: 'reserved' | 'taken' | 'invalid_format' | 'too_short' | 'too_long';
  suggestedAlternatives?: string[];
}

export interface AccessHistoryEntry {
  id: string;
  archiveId: string;
  action: 'pin_entry' | 'recovery_key_unlock' | 'editor_save' | 'content_edit' | 'deploy_attempt';
  actorRole: 'owner' | 'contributor' | 'editor';
  summary: string;
  ipHint?: string;
  deviceInfo?: string;
  success: boolean;
  timestamp: string;
}

export interface AnalyticsEvent {
  name: string;
  archiveId?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}
