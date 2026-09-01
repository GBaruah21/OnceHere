import bcrypt from 'bcryptjs';
import {
  Archive,
  Section,
  TimelineEvent,
  Member,
  MemberMessage,
  MediaItem,
  Album,
  WallPost,
  Revision,
  UserSession,
  DomainStatus,
  AccessHistoryEntry
} from '../src/types';
import { PLATFORM_CONFIG } from '../src/config/platform';

/**
 * Multi-tenant archive store. It keeps the existing synchronous API used by
 * the application, while saving a complete state snapshot to Supabase when
 * the server is configured with SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
class MemoryDatabase {
  archives: Map<string, Archive> = new Map();
  sections: Map<string, Section[]> = new Map(); // archiveId -> sections
  timelineEvents: Map<string, TimelineEvent[]> = new Map(); // archiveId -> events
  members: Map<string, Member[]> = new Map(); // archiveId -> members
  memberMessages: Map<string, MemberMessage[]> = new Map(); // archiveId -> messages
  mediaItems: Map<string, MediaItem[]> = new Map(); // archiveId -> media
  albums: Map<string, Album[]> = new Map(); // archiveId -> albums
  wallPosts: Map<string, WallPost[]> = new Map(); // archiveId -> posts
  revisions: Map<string, Revision[]> = new Map(); // archiveId -> revisions
  accessLogs: Map<string, AccessHistoryEntry[]> = new Map(); // archiveId -> access logs
  sessions: Map<string, UserSession> = new Map(); // token -> session
  rateLimits: Map<string, { attempts: number; firstAttemptAt: number; lockedUntil?: number }> = new Map();
  platformSettings: { instagram?: string; email?: string; displayHandle?: string } = {};
  private loadedFromStorage = false;
  private loadingPromise?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.seedSampleData();
  }

  private get storageConfig() {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_SECRET_KEY;
    return url && key ? { url, key } : undefined;
  }

  private snapshot() {
    return {
      archives: Array.from(this.archives.entries()),
      sections: Array.from(this.sections.entries()),
      timelineEvents: Array.from(this.timelineEvents.entries()),
      members: Array.from(this.members.entries()),
      memberMessages: Array.from(this.memberMessages.entries()),
      mediaItems: Array.from(this.mediaItems.entries()),
      albums: Array.from(this.albums.entries()),
      wallPosts: Array.from(this.wallPosts.entries()),
      revisions: Array.from(this.revisions.entries()),
      accessLogs: Array.from(this.accessLogs.entries()),
      sessions: Array.from(this.sessions.entries()),
      rateLimits: Array.from(this.rateLimits.entries()),
      platformSettings: this.platformSettings
    };
  }

  private restoreMap<T>(value: unknown): Map<string, T> {
    return new Map(Array.isArray(value) ? (value as [string, T][]) : []);
  }

  private restore(snapshot: Record<string, unknown>) {
    this.archives = this.restoreMap<Archive>(snapshot.archives);
    this.sections = this.restoreMap<Section[]>(snapshot.sections);
    this.timelineEvents = this.restoreMap<TimelineEvent[]>(snapshot.timelineEvents);
    this.members = this.restoreMap<Member[]>(snapshot.members);
    this.memberMessages = this.restoreMap<MemberMessage[]>(snapshot.memberMessages);
    this.mediaItems = this.restoreMap<MediaItem[]>(snapshot.mediaItems);
    this.albums = this.restoreMap<Album[]>(snapshot.albums);
    this.wallPosts = this.restoreMap<WallPost[]>(snapshot.wallPosts);
    this.revisions = this.restoreMap<Revision[]>(snapshot.revisions);
    this.accessLogs = this.restoreMap<AccessHistoryEntry[]>(snapshot.accessLogs);
    this.sessions = this.restoreMap<UserSession>(snapshot.sessions);
    this.rateLimits = this.restoreMap<{ attempts: number; firstAttemptAt: number; lockedUntil?: number }>(snapshot.rateLimits);
    this.platformSettings = snapshot.platformSettings && typeof snapshot.platformSettings === 'object'
      ? snapshot.platformSettings as { instagram?: string; email?: string; displayHandle?: string }
      : {};
  }

  getPlatformSettings() {
    return { ...this.platformSettings };
  }

  updatePlatformSettings(settings: { instagram?: string; email?: string; displayHandle?: string }) {
    this.platformSettings = { ...this.platformSettings, ...settings };
    return this.getPlatformSettings();
  }

  /** Loads the durable state once per server start, before any API route runs. */
  async ensureLoaded(): Promise<void> {
    if (this.loadedFromStorage) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const config = this.storageConfig;
      // Keep AI Studio and local development working without any cloud setup.
      if (!config) {
        this.loadedFromStorage = true;
        return;
      }

      const response = await fetch(`${config.url}/rest/v1/oncehere_state?id=eq.primary&select=data`, {
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }
      });
      if (!response.ok) throw new Error(`Supabase load failed (${response.status}). Run supabase/schema.sql first.`);

      const rows = await response.json() as Array<{ data?: Record<string, unknown> }>;
      if (rows[0]?.data) this.restore(rows[0].data);
      this.loadedFromStorage = true;

      // First production request stores the built-in demo data as the initial state.
      if (!rows[0]?.data) await this.persist();
    })();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = undefined;
    }
  }

  /** Queues writes so a newer archive edit cannot be overwritten by an older one. */
  persist(): Promise<void> {
    const config = this.storageConfig;
    if (!config) return Promise.resolve();
    const data = this.snapshot();
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const response = await fetch(`${config.url}/rest/v1/oncehere_state?on_conflict=id`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{ id: 'primary', data, updated_at: new Date().toISOString() }])
      });
      if (!response.ok) throw new Error(`Supabase save failed (${response.status}).`);
    });
    return this.writeQueue;
  }

  // --- Slug & Tenant Lookups ---
  findBySlug(slug: string): Archive | undefined {
    const cleanSlug = slug.toLowerCase().trim();
    for (const archive of this.archives.values()) {
      if (archive.slug === cleanSlug || archive.workspaceSlug === cleanSlug) {
        if (!archive.deletedAt) return archive;
      }
    }
    return undefined;
  }

  findById(id: string): Archive | undefined {
    const archive = this.archives.get(id);
    if (archive && !archive.deletedAt) return archive;
    return undefined;
  }

  isSlugAvailable(slug: string, currentArchiveId?: string): boolean {
    const clean = slug.toLowerCase().trim();
    if (PLATFORM_CONFIG.reservedSlugs.includes(clean as any)) {
      return false;
    }
    for (const archive of this.archives.values()) {
      if (archive.deletedAt) continue;
      if (archive.id === currentArchiveId) continue;
      if (archive.slug === clean || archive.workspaceSlug === clean) {
        return false;
      }
    }
    return true;
  }

  // --- Archives CRUD ---
  createArchive(archive: Archive): Archive {
    this.archives.set(archive.id, archive);
    this.sections.set(archive.id, []);
    this.timelineEvents.set(archive.id, []);
    this.members.set(archive.id, []);
    this.memberMessages.set(archive.id, []);
    this.mediaItems.set(archive.id, []);
    this.albums.set(archive.id, []);
    this.wallPosts.set(archive.id, []);
    this.revisions.set(archive.id, []);
    this.accessLogs.set(archive.id, []);

    // Create initial revision & access log
    this.addRevision(archive.id, 'archive', 'Archive workspace initialized', 'owner', archive);
    this.addAccessLog(archive.id, {
      action: 'recovery_key_unlock',
      actorRole: 'owner',
      summary: 'Archive Workspace Created & Initialized',
      deviceInfo: 'Owner Device'
    });
    return archive;
  }

  updateArchive(id: string, updates: Partial<Archive>, actor: 'owner' | 'contributor' = 'owner'): Archive | undefined {
    const existing = this.archives.get(id);
    if (!existing || existing.deletedAt) return undefined;

    const updated: Archive = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.archives.set(id, updated);
    this.addRevision(id, 'archive', 'Updated archive settings & details', actor, updated);
    return updated;
  }

  deleteArchive(id: string): boolean {
    const existing = this.archives.get(id);
    if (!existing) return false;
    existing.deletedAt = new Date().toISOString();
    this.archives.set(id, existing);
    return true;
  }

  listPublicArchives(): Archive[] {
    return Array.from(this.archives.values()).filter(
      (a) => !a.deletedAt
        && !a.isHiddenFromExplore
        && (a.deploymentStatus === 'deployed' || a.id.startsWith('demo-'))
        && a.visibility === 'public'
    );
  }

  // --- Sections Management ---
  getSections(archiveId: string): Section[] {
    return this.sections.get(archiveId) || [];
  }

  setSections(archiveId: string, sections: Section[], actor: 'owner' | 'contributor' = 'owner'): Section[] {
    this.sections.set(archiveId, sections);
    this.addRevision(archiveId, 'sections', 'Reordered / updated sections structure', actor, sections);
    return sections;
  }

  updateSection(archiveId: string, sectionId: string, updates: Partial<Section>): Section | undefined {
    const list = this.getSections(archiveId);
    const index = list.findIndex((s) => s.id === sectionId);
    if (index === -1) return undefined;

    list[index] = { ...list[index], ...updates };
    this.sections.set(archiveId, list);
    this.addRevision(archiveId, 'sections', `Updated section: ${list[index].displayTitle}`, 'owner', list);
    return list[index];
  }

  // --- Timeline Events ---
  getTimelineEvents(archiveId: string): TimelineEvent[] {
    return (this.timelineEvents.get(archiveId) || []).sort((a, b) => a.position - b.position);
  }

  addTimelineEvent(archiveId: string, event: TimelineEvent): TimelineEvent {
    const list = this.timelineEvents.get(archiveId) || [];
    list.push(event);
    this.timelineEvents.set(archiveId, list);
    this.addRevision(archiveId, 'timeline', `Added timeline milestone: "${event.title}"`, 'contributor', list);
    return event;
  }

  updateTimelineEvent(archiveId: string, eventId: string, updates: Partial<TimelineEvent>): TimelineEvent | undefined {
    const list = this.timelineEvents.get(archiveId) || [];
    const index = list.findIndex((e) => e.id === eventId);
    if (index === -1) return undefined;
    list[index] = { ...list[index], ...updates };
    this.timelineEvents.set(archiveId, list);
    this.addRevision(archiveId, 'timeline', `Updated milestone "${list[index].title}"`, 'contributor', list);
    return list[index];
  }

  deleteTimelineEvent(archiveId: string, eventId: string): boolean {
    const list = this.timelineEvents.get(archiveId) || [];
    const filtered = list.filter((e) => e.id !== eventId);
    if (filtered.length === list.length) return false;
    this.timelineEvents.set(archiveId, filtered);
    this.addRevision(archiveId, 'timeline', 'Deleted timeline milestone', 'contributor', filtered);
    return true;
  }

  // --- Members & Yearbook ---
  getMembers(archiveId: string): Member[] {
    return (this.members.get(archiveId) || []).sort((a, b) => a.position - b.position);
  }

  addMember(archiveId: string, member: Member): Member {
    const list = this.members.get(archiveId) || [];
    list.push(member);
    this.members.set(archiveId, list);
    this.addRevision(archiveId, 'members', `Added member: ${member.name}`, 'contributor', list);
    return member;
  }

  updateMember(archiveId: string, memberId: string, updates: Partial<Member>): Member | undefined {
    const list = this.members.get(archiveId) || [];
    const index = list.findIndex((m) => m.id === memberId);
    if (index === -1) return undefined;
    list[index] = { ...list[index], ...updates };
    this.members.set(archiveId, list);
    this.addRevision(archiveId, 'members', `Updated member: ${list[index].name}`, 'contributor', list);
    return list[index];
  }

  deleteMember(archiveId: string, memberId: string): boolean {
    const list = this.members.get(archiveId) || [];
    const filtered = list.filter((m) => m.id !== memberId);
    if (filtered.length === list.length) return false;
    this.members.set(archiveId, filtered);
    this.addRevision(archiveId, 'members', 'Deleted member record', 'contributor', filtered);
    return true;
  }

  // --- Member Messages ---
  getMemberMessages(archiveId: string, memberId: string): MemberMessage[] {
    const all = this.memberMessages.get(archiveId) || [];
    return all.filter((m) => m.memberId === memberId && !m.isHidden);
  }

  addMemberMessage(archiveId: string, msg: MemberMessage): MemberMessage {
    const list = this.memberMessages.get(archiveId) || [];
    list.push(msg);
    this.memberMessages.set(archiveId, list);
    return msg;
  }

  // --- Media Vault ---
  getMediaItems(archiveId: string): MediaItem[] {
    return (this.mediaItems.get(archiveId) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  addMediaItem(archiveId: string, item: MediaItem): MediaItem {
    const list = this.mediaItems.get(archiveId) || [];
    list.push(item);
    this.mediaItems.set(archiveId, list);
    this.addRevision(archiveId, 'media', `Added ${item.type}: ${item.caption || 'New upload'}`, 'contributor', list);
    return item;
  }

  updateMediaItem(archiveId: string, mediaId: string, updates: Partial<MediaItem>): MediaItem | undefined {
    const list = this.mediaItems.get(archiveId) || [];
    const index = list.findIndex((m) => m.id === mediaId);
    if (index === -1) return undefined;
    list[index] = { ...list[index], ...updates };
    this.mediaItems.set(archiveId, list);
    this.addRevision(archiveId, 'media', `Updated media: ${list[index].caption || list[index].id}`, 'contributor', list);
    return list[index];
  }

  addMediaNote(archiveId: string, mediaId: string, note: { authorName: string; text: string }): { item: MediaItem; note: any } | undefined {
    const list = this.mediaItems.get(archiveId) || [];
    const index = list.findIndex((m) => m.id === mediaId);
    if (index === -1) return undefined;
    const item = list[index];
    const notes = item.notes ? [...item.notes] : [];
    const createdNote = {
      id: `mn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      authorName: note.authorName || 'Classmate',
      text: note.text,
      createdAt: new Date().toISOString()
    };
    notes.push(createdNote);
    item.notes = notes;
    list[index] = item;
    this.mediaItems.set(archiveId, list);
    return { item, note: createdNote };
  }

  deleteMediaNote(archiveId: string, mediaId: string, noteId: string): MediaItem | undefined {
    const list = this.mediaItems.get(archiveId) || [];
    const index = list.findIndex((m) => m.id === mediaId);
    if (index === -1) return undefined;
    const item = list[index];
    if (!item.notes) return item;
    item.notes = item.notes.filter((n) => n.id !== noteId);
    list[index] = item;
    this.mediaItems.set(archiveId, list);
    return item;
  }

  deleteMediaItem(archiveId: string, mediaId: string): boolean {
    const list = this.mediaItems.get(archiveId) || [];
    const filtered = list.filter((m) => m.id !== mediaId);
    if (filtered.length === list.length) return false;
    this.mediaItems.set(archiveId, filtered);
    this.addRevision(archiveId, 'media', 'Removed media item from vault', 'contributor', filtered);
    return true;
  }

  getAlbums(archiveId: string): Album[] {
    return (this.albums.get(archiveId) || []).sort((a, b) => a.position - b.position);
  }

  addAlbum(archiveId: string, album: Album): Album {
    const list = this.albums.get(archiveId) || [];
    list.push(album);
    this.albums.set(archiveId, list);
    return album;
  }

  // --- Memory Wall ---
  getWallPosts(archiveId: string, includeHidden: boolean = false): WallPost[] {
    return (this.wallPosts.get(archiveId) || [])
      .filter((p) => includeHidden ? true : (p.isApproved !== false && !p.isHidden))
      .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  addWallPost(archiveId: string, post: WallPost): WallPost {
    const list = this.wallPosts.get(archiveId) || [];
    list.unshift(post);
    this.wallPosts.set(archiveId, list);
    return post;
  }

  updateWallPost(archiveId: string, postId: string, updates: Partial<WallPost>): WallPost | undefined {
    const list = this.wallPosts.get(archiveId) || [];
    const index = list.findIndex((p) => p.id === postId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      this.wallPosts.set(archiveId, list);
      return list[index];
    }
    return undefined;
  }

  likeWallPost(archiveId: string, postId: string): WallPost | undefined {
    const list = this.wallPosts.get(archiveId) || [];
    const post = list.find((p) => p.id === postId);
    if (post) {
      post.likesCount = (post.likesCount || 0) + 1;
      return post;
    }
    return undefined;
  }

  deleteWallPost(archiveId: string, postId: string): boolean {
    const list = this.wallPosts.get(archiveId) || [];
    const filtered = list.filter((p) => p.id !== postId);
    if (filtered.length === list.length) return false;
    this.wallPosts.set(archiveId, filtered);
    return true;
  }

  // --- Revisions & History ---
  getRevisions(archiveId: string): Revision[] {
    return (this.revisions.get(archiveId) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  addRevision(
    archiveId: string,
    entityType: Revision['entityType'],
    summary: string,
    actorType: Revision['actorType'],
    snapshotData: any
  ): Revision {
    const list = this.revisions.get(archiveId) || [];
    const rev: Revision = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      archiveId,
      entityType,
      summary,
      actorType,
      snapshotData: JSON.parse(JSON.stringify(snapshotData)),
      createdAt: new Date().toISOString()
    };
    list.unshift(rev);
    // Keep max 30 revisions
    if (list.length > 30) list.pop();
    this.revisions.set(archiveId, list);
    return rev;
  }

  restoreRevision(archiveId: string, revisionId: string): boolean {
    const list = this.getRevisions(archiveId);
    const rev = list.find((r) => r.id === revisionId);
    if (!rev) return false;

    if (rev.entityType === 'archive' && rev.snapshotData) {
      this.archives.set(archiveId, { ...rev.snapshotData, updatedAt: new Date().toISOString() });
    } else if (rev.entityType === 'sections' && Array.isArray(rev.snapshotData)) {
      this.sections.set(archiveId, rev.snapshotData);
    } else if (rev.entityType === 'timeline' && Array.isArray(rev.snapshotData)) {
      this.timelineEvents.set(archiveId, rev.snapshotData);
    } else if (rev.entityType === 'members' && Array.isArray(rev.snapshotData)) {
      this.members.set(archiveId, rev.snapshotData);
    } else if (rev.entityType === 'media' && Array.isArray(rev.snapshotData)) {
      this.mediaItems.set(archiveId, rev.snapshotData);
    }

    this.addRevision(archiveId, rev.entityType, `Restored revision from ${new Date(rev.createdAt).toLocaleTimeString()}`, 'owner', rev.snapshotData);
    return true;
  }

  // --- Access History & Security Audit Logs ---
  getAccessLogs(archiveId: string, limit: number = 5): AccessHistoryEntry[] {
    const list = this.accessLogs.get(archiveId) || [];
    return list
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  addAccessLog(
    archiveId: string,
    entry: {
      action: AccessHistoryEntry['action'];
      actorRole: AccessHistoryEntry['actorRole'];
      summary: string;
      ipHint?: string;
      deviceInfo?: string;
      success?: boolean;
    }
  ): AccessHistoryEntry {
    const list = this.accessLogs.get(archiveId) || [];
    const log: AccessHistoryEntry = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      archiveId,
      action: entry.action,
      actorRole: entry.actorRole,
      summary: entry.summary,
      ipHint: entry.ipHint || 'Direct Web Session',
      deviceInfo: entry.deviceInfo || 'Standard Web Browser',
      success: entry.success !== false,
      timestamp: new Date().toISOString()
    };
    list.unshift(log);
    // Keep max 30 recent access logs
    if (list.length > 30) list.pop();
    this.accessLogs.set(archiveId, list);
    return log;
  }

  // --- Seed Rich Demo Archives (Section 13A - Indian Student Batches) ---
  private seedSampleData() {
    const salt = bcrypt.genSaltSync(8);
    const samplePinHash = bcrypt.hashSync('202525', salt);
    const recoveryHash = bcrypt.hashSync('mc_rec_sample_key_123', salt);

    // =========================================================================
    // DEMO 1: Mary’s Convent School — Class of 2025 (Nostalgic Paper / School)
    // =========================================================================
    const marysId = 'demo-marys-2025';
    const marysArchive: Archive = {
      id: marysId,
      workspaceSlug: 'ws-marys-convent',
      slug: 'marys-convent-2025',
      title: 'Mary’s Convent School — Class of 2025',
      organizationName: 'Mary’s Convent High School',
      subtitle: 'Polished shoes, loud corridors and one last bell.',
      archiveType: 'school',
      startYear: 2013,
      endYear: 2025,
      batchLabel: 'Batch of ’25',
      approxPeopleCount: 6,
      themeId: 'paper-polaroids',
      visibility: 'public',
      contributionMode: 'pin-protected',
      editorPinHash: samplePinHash,
      recoveryKeyHash: recoveryHash,
      deploymentStatus: 'deployed',
      publishedAt: '2025-04-15T10:00:00.000Z',
      createdAt: '2025-03-01T12:00:00.000Z',
      updatedAt: '2025-04-15T10:00:00.000Z',
      domainStatus: 'verified',
      settings: {
        allowAnonymousWall: true,
        requireWallApproval: false,
        allowMediaDownloads: true,
        allowMemberMessages: true,
        allowPublicSearch: true,
        enableProfanityFilter: false,
        enableBackgroundMusic: false,
        heroButtonText: 'The Years We’ll Carry',
        heroSecondaryText: 'Open School Scrapbook',
        customClosingTitle: 'The Last Bell',
        customClosingNote: 'The archive ends here. The story does not. May our laughter echo down these quiet halls forever.'
      }
    };
    this.createArchive(marysArchive);

    this.setSections(marysId, [
      { id: 'sec-m-1', archiveId: marysId, stableType: 'hero', navigationLabel: 'Home', displayTitle: 'The Years We’ll Carry', description: 'Polished shoes, loud corridors and one last bell.', position: 0, isVisible: true },
      { id: 'sec-m-2', archiveId: marysId, stableType: 'timeline', navigationLabel: 'First Bell', displayTitle: 'The First Bell', description: 'From kindergarten tears to the final board exam goodbye.', layout: 'vertical-cinematic', position: 1, isVisible: true },
      { id: 'sec-m-3', archiveId: marysId, stableType: 'members', navigationLabel: 'Our People', displayTitle: 'People We Found Along the Way', description: 'The artists, backbenchers, house captains, and canteen regulars.', position: 2, isVisible: true },
      { id: 'sec-m-4', archiveId: marysId, stableType: 'media-vault', navigationLabel: 'Evidence', displayTitle: 'School-Day Evidence', description: 'Morning assembly, sports day heats, science exhibitions, and annual rehearsals.', position: 3, isVisible: true },
      { id: 'sec-m-5', archiveId: marysId, stableType: 'memory-wall', navigationLabel: 'Memory Wall', displayTitle: 'Things We Still Talk About', description: 'Tiffin confessions, autograph scribbles, and words we never said out loud.', position: 4, isVisible: true },
      { id: 'sec-m-6', archiveId: marysId, stableType: 'closing', navigationLabel: 'Last Bell', displayTitle: 'The Last Bell', description: 'One last walk through the corridor before we went our separate ways.', position: 5, isVisible: true }
    ]);

    // Timeline Events for Mary's
    const mTimeline: TimelineEvent[] = [
      {
        id: 'te-m-1',
        archiveId: marysId,
        yearLabel: '2013',
        eventDate: '2013-06-10',
        title: 'New Shoes, New Classrooms',
        description: 'The first day began with polished shoes, unfamiliar classrooms and the quiet hope that someone would become a friend.',
        icon: '🎒',
        tags: ['The First Bell', 'Beginnings'],
        position: 0,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'te-m-2',
        archiveId: marysId,
        yearLabel: '2016',
        eventDate: '2016-09-14',
        title: 'The Corridor Became Ours',
        description: 'Somewhere between lunch breaks, library periods and shared notebooks, classmates became the people we looked for every morning.',
        icon: '📚',
        tags: ['Corridor Days', 'Friendship'],
        position: 1,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'te-m-3',
        archiveId: marysId,
        yearLabel: '2019',
        eventDate: '2019-11-20',
        title: 'Learning Outside the Timetable',
        description: 'Competitions, rehearsals, school trips and ordinary afternoons taught us lessons no textbook could hold.',
        icon: '🎭',
        tags: ['Annual Day', 'Rehearsals'],
        position: 2,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'te-m-4',
        archiveId: marysId,
        yearLabel: '2023',
        eventDate: '2023-12-15',
        title: 'Growing Up Between These Walls',
        description: 'The classrooms looked the same, but we had changed. Every familiar corner began to feel like part of a goodbye.',
        icon: '🏫',
        tags: ['Senior Years', 'Reflections'],
        position: 3,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'te-m-5',
        archiveId: marysId,
        yearLabel: '2025',
        eventDate: '2025-03-28',
        title: 'The Last Bell',
        description: 'We left with certificates, photographs, handwritten notes and a thousand small memories that would follow us beyond the school gate.',
        icon: '🔔',
        tags: ['Farewell', 'Autograph Books'],
        position: 4,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2025-03-01T12:00:00.000Z'
      }
    ];
    mTimeline.forEach((e) => this.addTimelineEvent(marysId, e));

    // Members for Mary's
    const mMembers: Member[] = [
      {
        id: 'mem-m-1',
        archiveId: marysId,
        name: 'Ananya Deshmukh',
        nickname: 'Head Girl',
        groupLabel: 'Class 12 Science',
        quote: '‘I thought I would remember the big events. I remember the lunch breaks more.’',
        memory: 'Leading morning assembly prayers and calming everyone before board practicals.',
        imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
        tags: ['Head Girl', 'Council'],
        position: 0,
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-m-2',
        archiveId: marysId,
        name: 'Ishaan Verma',
        nickname: 'Backbench Department',
        groupLabel: 'Class 12 Commerce',
        quote: '‘The school bell knew our schedule better than we did.’',
        memory: 'Secretly playing book cricket during chemistry class and never getting caught.',
        imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
        tags: ['Backbenchers', 'Sports'],
        position: 1,
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-m-3',
        archiveId: marysId,
        name: 'Diya Banerjee',
        nickname: 'Red House Captain',
        groupLabel: 'Class 12 Humanities',
        quote: '‘I still remember who saved me a seat on the first day.’',
        memory: 'Directing the Inter-House drama that won us the gold shield after six years.',
        imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
        tags: ['Red House', 'Drama'],
        position: 2,
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-m-4',
        archiveId: marysId,
        name: 'Tanmay Joshi',
        nickname: 'Canteen Regular',
        groupLabel: 'Class 12 Science',
        quote: '‘The canteen knew our order before we reached the counter.’',
        memory: 'Sharing one samosa among four people behind the cycle stand.',
        imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
        tags: ['Football', 'Samosa Club'],
        position: 3,
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-m-5',
        archiveId: marysId,
        name: 'Sneha Kulkarni',
        nickname: 'The Note-Maker',
        groupLabel: 'Class 12 Science',
        quote: '‘Some friendships began with a borrowed pen.’',
        memory: 'Color-coded biology diagrams photocopied by the entire batch before mid-terms.',
        imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
        tags: ['Academics', 'Library'],
        position: 4,
        createdAt: '2025-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-m-6',
        archiveId: marysId,
        name: 'Karan Mehra',
        nickname: 'Relay Anchor',
        groupLabel: 'Class 12 Commerce',
        quote: '‘We complained every day and still never wanted it to end.’',
        memory: 'The muddy 4x100m relay on sports day under heavy monsoon drizzle.',
        imageUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80',
        tags: ['Athletics', 'Blue House'],
        position: 5,
        createdAt: '2025-03-01T12:00:00.000Z'
      }
    ];
    mMembers.forEach((m) => this.addMember(marysId, m));

    // Media Items for Mary's
    const mMedia: MediaItem[] = [
      {
        id: 'med-m-1',
        archiveId: marysId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
        caption: 'The morning assembly ground before the first bell rang.',
        tags: ['Assembly', 'First Days'],
        createdAt: '2025-03-02T10:00:00.000Z'
      },
      {
        id: 'med-m-2',
        archiveId: marysId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        caption: 'The first group photograph where nobody knew where to stand.',
        tags: ['Classroom Stories', 'Corridor'],
        createdAt: '2025-03-05T14:00:00.000Z'
      },
      {
        id: 'med-m-3',
        archiveId: marysId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=80',
        caption: 'Decorations completed approximately two minutes before the annual day began.',
        tags: ['Annual Day', 'Rehearsals'],
        createdAt: '2025-03-10T11:00:00.000Z'
      },
      {
        id: 'med-m-4',
        archiveId: marysId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80',
        caption: 'One last walk through the corridor. The room stayed; we moved on.',
        tags: ['Farewell 2025', 'Autographs'],
        createdAt: '2025-03-12T16:00:00.000Z'
      }
    ];
    mMedia.forEach((med) => this.addMediaItem(marysId, med));

    // Memory Wall for Mary's
    const mWall: WallPost[] = [
      {
        id: 'wp-m-1',
        archiveId: marysId,
        authorName: 'Sr. Margaret (Principal)',
        text: 'To our dearest Class of 2025: Walk into the world with kindness in your heart, courage in your steps, and the values that will forever light your way.',
        cardStyle: 'polaroid',
        isPinned: true,
        isApproved: true,
        likesCount: 52,
        createdAt: '2025-03-25T09:00:00.000Z'
      },
      {
        id: 'wp-m-2',
        archiveId: marysId,
        authorName: 'Rhea & Simran',
        text: 'To the person who always saved me a seat on the school bus: I noticed, every single morning. We complained about 7 AM assembly, but I’d give anything for one more Tuesday.',
        cardStyle: 'sticky-yellow',
        isPinned: false,
        isApproved: true,
        likesCount: 38,
        createdAt: '2025-03-26T14:30:00.000Z'
      },
      {
        id: 'wp-m-3',
        archiveId: marysId,
        authorName: 'Anonymous Backbencher',
        text: 'Whoever borrowed my geometry compass during the 10th ICSE boards and never returned it: you passed, so I guess we’re even!',
        cardStyle: 'classic-paper',
        isPinned: false,
        isApproved: true,
        likesCount: 29,
        createdAt: '2025-03-27T18:20:00.000Z'
      }
    ];
    mWall.forEach((w) => this.addWallPost(marysId, w));

    // Access History Logs for Mary's Convent (Tracking last 5 PIN & edit operations)
    this.accessLogs.set(marysId, [
      {
        id: 'acc-m-1',
        archiveId: marysId,
        action: 'pin_entry',
        actorRole: 'contributor',
        summary: 'Successful Contributor PIN Entry (PIN: 202525)',
        ipHint: '192.168.1.42',
        deviceInfo: 'Chrome on macOS',
        success: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString()
      },
      {
        id: 'acc-m-2',
        archiveId: marysId,
        action: 'editor_save',
        actorRole: 'owner',
        summary: 'Updated Archive Theme to Paper Polaroids & Saved Settings',
        ipHint: '10.0.0.8',
        deviceInfo: 'Safari on iPad Pro',
        success: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 65).toISOString()
      },
      {
        id: 'acc-m-3',
        archiveId: marysId,
        action: 'content_edit',
        actorRole: 'contributor',
        summary: 'Added 4 New Photos & Captions to Media Vault',
        ipHint: '172.16.4.15',
        deviceInfo: 'Mobile Safari on iPhone 15',
        success: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString()
      },
      {
        id: 'acc-m-4',
        archiveId: marysId,
        action: 'deploy_attempt',
        actorRole: 'owner',
        summary: 'Live Deployment Published to /s/marys-convent-2025',
        ipHint: '10.0.0.8',
        deviceInfo: 'Chrome on macOS',
        success: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
      },
      {
        id: 'acc-m-5',
        archiveId: marysId,
        action: 'recovery_key_unlock',
        actorRole: 'owner',
        summary: 'Owner Master Recovery Key Authenticated',
        ipHint: '10.0.0.8',
        deviceInfo: 'Chrome on macOS',
        success: true,
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
      }
    ]);

    // =========================================================================
    // DEMO 2: Riverdale Institute of Technology — Class of 2026 (Cinematic Dark)
    // =========================================================================
    const riverdaleId = 'demo-riverdale-2026';
    const riverdaleArchive: Archive = {
      id: riverdaleId,
      workspaceSlug: 'ws-riverdale-tech',
      slug: 'riverdale-tech-2026',
      title: 'Riverdale Institute of Technology — Class of 2026',
      organizationName: 'Riverdale Institute of Technology',
      subtitle: 'Deadlines, lab room funs and people who made it worth showing up.',
      archiveType: 'college',
      startYear: 2022,
      endYear: 2026,
      batchLabel: 'B.Tech Batch of ’26',
      approxPeopleCount: 34,
      themeId: 'midnight-cinema',
      visibility: 'public',
      contributionMode: 'open',
      editorPinHash: samplePinHash,
      recoveryKeyHash: recoveryHash,
      deploymentStatus: 'deployed',
      publishedAt: '2026-05-20T12:00:00.000Z',
      createdAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-05-20T12:00:00.000Z',
      domainStatus: 'verified',
      settings: {
        allowAnonymousWall: true,
        requireWallApproval: false,
        allowMediaDownloads: true,
        allowMemberMessages: true,
        allowPublicSearch: true,
        enableProfanityFilter: false,
        enableBackgroundMusic: false,
        heroButtonText: 'The Years We’ll Carry',
        heroSecondaryText: 'Explore Lab Chronicles',
        customClosingTitle: 'Somehow, We Made It',
        customClosingNote: 'The deadlines ended before our friendships did. We thought we were waiting for the weekend; we were actually living the good years.'
      }
    };
    this.createArchive(riverdaleArchive);

    this.setSections(riverdaleId, [
      { id: 'sec-r-1', archiveId: riverdaleId, stableType: 'hero', navigationLabel: 'Campus', displayTitle: 'The Years We’ll Carry', description: 'Deadlines, lab room funs and people who made it worth showing up.', position: 0, isVisible: true },
      { id: 'sec-r-2', archiveId: riverdaleId, stableType: 'timeline', navigationLabel: 'How It Started', displayTitle: 'How It Started', description: 'From nervous registration queues to 3 AM hackathon breakthroughs.', layout: 'vertical-cinematic', position: 1, isVisible: true },
      { id: 'sec-r-3', archiveId: riverdaleId, stableType: 'members', navigationLabel: 'The Batch', displayTitle: 'People We Found Along the Way', description: 'CSE, ECE, Civil, Mech, and Design creators.', position: 2, isVisible: true },
      { id: 'sec-r-4', archiveId: riverdaleId, stableType: 'media-vault', navigationLabel: 'Proof', displayTitle: 'Proof We Were There', description: 'Lab room funs, canteen chronicles, festival all-nighters, and scribble-day shirts.', position: 3, isVisible: true },
      { id: 'sec-r-5', archiveId: riverdaleId, stableType: 'memory-wall', navigationLabel: 'The Wall', displayTitle: 'Messages From the Chaos', description: 'Inside jokes, proxy attendance regrets, and promises to meet for chai.', position: 4, isVisible: true },
      { id: 'sec-r-6', archiveId: riverdaleId, stableType: 'closing', navigationLabel: 'Farewell', displayTitle: 'Somehow, We Made It', description: 'One last photograph together before we stepped into the world.', position: 5, isVisible: true }
    ]);

    // Timeline Events for Riverdale
    const rTimeline: TimelineEvent[] = [
      {
        id: 'te-r-1',
        archiveId: riverdaleId,
        yearLabel: '2022',
        title: 'Strangers in the Same Corridor',
        description: 'Students arrived carrying documents, expectations and nervous smiles. By the end of the first week, unfamiliar faces had already started becoming familiar.',
        icon: '🚀',
        tags: ['Day 1', 'Orientation'],
        position: 0,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-r-2',
        archiveId: riverdaleId,
        yearLabel: '2023',
        title: 'The Night Campus Felt Like Ours',
        description: 'Weeks of rehearsals, unfinished decorations and last-minute changes finally became one unforgettable cultural festival evening.',
        icon: '🎸',
        tags: ['TechFest', 'Cultural Night'],
        position: 1,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-r-3',
        archiveId: riverdaleId,
        yearLabel: '2024',
        title: 'Built Between Deadlines',
        description: 'Assignments became harder, nights became longer and the people sitting beside us became the reason we kept going.',
        icon: '💻',
        tags: ['Lab Room Funs', 'Hackathons'],
        position: 2,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-r-4',
        archiveId: riverdaleId,
        yearLabel: '2025',
        title: 'Knowing Every Moment Was Becoming a Memory',
        description: 'Festivals, trips, presentations and ordinary canteen conversations suddenly carried more meaning because everyone knew the final year was approaching.',
        icon: '☕',
        tags: ['Canteen Chronicles', 'Roadtrips'],
        position: 3,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-r-5',
        archiveId: riverdaleId,
        yearLabel: '2026',
        title: 'One Last Photograph Together',
        description: 'Four years ended in photographs, handwritten shirts, unfinished conversations and promises to stay connected.',
        icon: '🎓',
        tags: ['Scribble Day', 'Graduation'],
        position: 4,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      }
    ];
    rTimeline.forEach((e) => this.addTimelineEvent(riverdaleId, e));

    // 34 Realistic Indian Student Members across 5 major departments
    const rMembers: Member[] = [
      {
        id: 'mem-r-1',
        archiveId: riverdaleId,
        name: 'Arjun Nambiar',
        nickname: 'Git Wizard & Tech Lead',
        groupLabel: 'CSE & Data Science',
        quote: '‘I came for the degree and stayed for the 3 AM lab debugging sessions.’',
        memory: 'Fixing the production bug five minutes before final project evaluation while living on black coffee.',
        imageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80',
        tags: ['Tech Lead', 'Hackathons', 'Hostel 3'],
        position: 0,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-2',
        archiveId: riverdaleId,
        name: 'Priya Sundaram',
        nickname: 'Fest Convenor',
        groupLabel: 'Design & Media',
        quote: '‘Most of my real attendance was marked at the college canteen.’',
        memory: 'Designing the 50-foot campus festival stage and coordinating 400 volunteers without sleeping for 48 hours.',
        imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
        tags: ['Fest Convenor', 'Design', 'Cultural Council'],
        position: 1,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-3',
        archiveId: riverdaleId,
        name: 'Siddharth Rao',
        nickname: 'Hardware Hacker',
        groupLabel: 'Mechanical Engineering',
        quote: '‘The workshop was for practicals. We used it to build dreams and test-drive electric go-karts.’',
        memory: 'Building an electric go-kart in the workshop and test-driving it across the parking lot at midnight.',
        imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
        tags: ['Robotics', 'Go-Kart Club', 'Hostel 2'],
        position: 2,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-4',
        archiveId: riverdaleId,
        name: 'Zoya Fatima',
        nickname: 'Maggi Specialist',
        groupLabel: 'Civil & Architecture',
        quote: '‘Our group projects always had one optimistic plan and seven emergency backups.’',
        memory: 'Hostel 4 rooftop jam sessions every Saturday night with two guitars and twenty off-key singers.',
        imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
        tags: ['Music Club', 'Hostel 4', 'Dramatics'],
        position: 3,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-5',
        archiveId: riverdaleId,
        name: 'Rohan Sengupta',
        nickname: 'Proxy Master General',
        groupLabel: 'CSE & Data Science',
        quote: '‘Somehow, the deadlines ended before our friendship did.’',
        memory: 'Answering roll calls in three distinct voices for eight consecutive semesters without getting caught.',
        imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
        tags: ['Canteen Dept', 'Gaming', 'Tapri Gang'],
        position: 4,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-6',
        archiveId: riverdaleId,
        name: 'Meera Mukherjee',
        nickname: 'Placement Ace',
        groupLabel: 'ECE & Electronics',
        quote: '‘The presentation worked on the final slide. Nobody knows how.’',
        memory: 'Celebrating our final placement offers at the corner tapri with unlimited cutting chai and bun maska.',
        imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
        tags: ['Placements', 'Debate', 'Editorial'],
        position: 5,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-7',
        archiveId: riverdaleId,
        name: 'Tanmay Joshi',
        nickname: 'Canteen Treasurer',
        groupLabel: 'CSE & Data Science',
        quote: '‘Splitwise has recorded more history than any college ledger.’',
        memory: 'Ordering 24 plates of samosas on credit during semester exam prep and settling it on the final day.',
        imageUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80',
        tags: ['Samosa Club', 'Treasurer', 'Finance'],
        position: 6,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-8',
        archiveId: riverdaleId,
        name: 'Gurpreet Singh',
        nickname: 'Bhangra Captain',
        groupLabel: 'Mechanical Engineering',
        quote: '‘If energy could generate electricity, our fest night could power the state.’',
        memory: 'Winning the Inter-College Bhangra trophy in Delhi and doing an impromptu victory procession around campus.',
        imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
        tags: ['Bhangra', 'Sports Sec', 'Gym Club'],
        position: 7,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-9',
        archiveId: riverdaleId,
        name: 'Sneha Kulkarni',
        nickname: 'Assignment Savior',
        groupLabel: 'CSE & Data Science',
        quote: '‘My handwritten notes got photocopied more than the official syllabus books.’',
        memory: 'Color-coded algorithm diagrams circulating in five WhatsApp groups thirty minutes before the mid-term exam.',
        imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
        tags: ['Notes Provider', 'Library Regular', 'Dean List'],
        position: 8,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-10',
        archiveId: riverdaleId,
        name: 'Kabir Singhania',
        nickname: 'Model UN Head',
        groupLabel: 'Design & Media',
        quote: '‘We came for the debate certificates; we stayed for the late-night tea stalls.’',
        memory: 'Representing college at the National Parliament debate and winning best delegation under pouring rain.',
        imageUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80',
        tags: ['Debate', 'MUN', 'Student Council'],
        position: 9,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-11',
        archiveId: riverdaleId,
        name: 'Ananya Deshmukh',
        nickname: 'Class Valedictorian',
        groupLabel: 'CSE & Data Science',
        quote: '‘I thought I would remember the grades. I only remember the laughter in the corridors.’',
        memory: 'Delivering the farewell speech on the main quadrangle as the sun went down behind the library clock tower.',
        imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80',
        tags: ['Valedictorian', 'Biotech', 'Hostel 1'],
        position: 10,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-12',
        archiveId: riverdaleId,
        name: 'Ishaan Verma',
        nickname: 'Backbench Legend',
        groupLabel: 'ECE & Electronics',
        quote: '‘The back row wasn’t just seating; it was an autonomous republic with its own rules.’',
        memory: 'Winning the class LAN counter-strike tournament while pretending to listen to the digital signal processing lecture.',
        imageUrl: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?auto=format&fit=crop&w=600&q=80',
        tags: ['Backbenchers', 'LAN Gaming', 'DSP Survivor'],
        position: 11,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-13',
        archiveId: riverdaleId,
        name: 'Devika Namboodiri',
        nickname: 'Classical Vocalist',
        groupLabel: 'Design & Media',
        quote: '‘Morning ragas at 6 AM in the auditorium echoed long after the microphones turned off.’',
        memory: 'Singing the welcome song at annual convocation and watching professors wipe away proud tears.',
        imageUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80',
        tags: ['Music Society', 'Design', 'Cultural Lead'],
        position: 12,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-14',
        archiveId: riverdaleId,
        name: 'Nikhil Chawla',
        nickname: 'Tapri In-Charge',
        groupLabel: 'CSE & Data Science',
        quote: '‘Every single life problem was solved over one hot cup of adrak chai.’',
        memory: 'Hosting the post-exam chai sessions outside Gate 2 where forty batchmates crammed onto eight plastic stools.',
        imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
        tags: ['Tapri Lead', 'Adrak Chai', 'Gate 2'],
        position: 13,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-15',
        archiveId: riverdaleId,
        name: 'Vaishnavi Patil',
        nickname: 'RoboWars Champion',
        groupLabel: 'Mechanical Engineering',
        quote: '‘Soldering irons, circuit burns, and autonomous line-followers that had a mind of their own.’',
        memory: 'Our bot winning the National Robowars in IIT Bombay after we rebuilt the motor driver in the hotel bathroom.',
        imageUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=600&q=80',
        tags: ['Robotics', 'Hardware', 'IIT Champion'],
        position: 14,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-16',
        archiveId: riverdaleId,
        name: 'Tenzin Norbu',
        nickname: 'Campus Photographer',
        groupLabel: 'Design & Media',
        quote: '‘I saw four years through a 50mm lens and captured 40,000 memories.’',
        memory: 'Sneaking onto the library roof to capture the golden-hour batch portrait that became the official yearbook cover.',
        imageUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80',
        tags: ['Yearbook Photo', 'Media Head', 'Roof Access'],
        position: 15,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-17',
        archiveId: riverdaleId,
        name: 'Ritu Phogat',
        nickname: 'Athletics Captain',
        groupLabel: 'Civil & Architecture',
        quote: '‘Pain is temporary, but the inter-college championship trophy stays in the cabinet forever.’',
        memory: 'Running the final anchor leg in 4x400m relay to clinch the athletics gold for the third consecutive year.',
        imageUrl: 'https://images.unsplash.com/photo-1525130413817-d45c1d127c42?auto=format&fit=crop&w=600&q=80',
        tags: ['Athletics Gold', 'Relay Anchor', 'Fitness'],
        position: 16,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-18',
        archiveId: riverdaleId,
        name: 'Pranav Reddy',
        nickname: 'Hackathon Veteran',
        groupLabel: 'CSE & Data Science',
        quote: '‘Red Bull, pizza crusts, and git merge conflicts at 4:30 in the morning.’',
        memory: 'Winning our first smart-city hackathon and treating the whole hostel floor to midnight chicken biryani.',
        imageUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=600&q=80',
        tags: ['AI Lead', 'Midnight Biryani', 'Hostel 3'],
        position: 17,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-19',
        archiveId: riverdaleId,
        name: 'Jasleen Kaur',
        nickname: 'Fine Arts Head',
        groupLabel: 'Civil & Architecture',
        quote: '‘There is no problem that a set of paints, charcoal, and good music cannot heal.’',
        memory: 'Painting the 120-foot college entrance wall mural under the blazing sun with twenty batchmates singing songs.',
        imageUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=80',
        tags: ['Wall Mural', 'Fine Arts', 'Rangoli Lead'],
        position: 18,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-20',
        archiveId: riverdaleId,
        name: 'Varun Pillai',
        nickname: 'Cricket Vice-Captain',
        groupLabel: 'Mechanical Engineering',
        quote: '‘Six runs required off the last ball against our arch-rivals: the most deafening cheer in college history.’',
        memory: 'Hitting the final boundary at 7 PM under floodlights as the whole campus rushed onto the pitch.',
        imageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=80',
        tags: ['Cricket Match', 'Floodlights', 'Sports Sec'],
        position: 19,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-21',
        archiveId: riverdaleId,
        name: 'Neha Bhattacharya',
        nickname: 'Literary Society Head',
        groupLabel: 'Design & Media',
        quote: '‘In the library reading room, we discovered worlds bigger than our exams.’',
        memory: 'Publishing the 100-page batch anthology containing every poem, confession, and story written during college.',
        imageUrl: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=600&q=80',
        tags: ['Anthology', 'Poetry', 'Lit Club'],
        position: 20,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-22',
        archiveId: riverdaleId,
        name: 'Harish Patel',
        nickname: 'Startup Founder',
        groupLabel: 'CSE & Data Science',
        quote: '‘Pitch decks during the day, coding during the night, and exams in between.’',
        memory: 'Launching our campus delivery app that crashed within two minutes because 500 students ordered Maggi at once.',
        imageUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=600&q=80',
        tags: ['E-Cell', 'Startup', 'Maggi App'],
        position: 21,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-23',
        archiveId: riverdaleId,
        name: 'Pooja Hegde',
        nickname: 'Dramatics President',
        groupLabel: 'ECE & Electronics',
        quote: '‘Stage lights blind you just enough so you forget stage fright.’',
        memory: 'The street play on social awareness performed in front of 3,000 students in the central amphitheater.',
        imageUrl: 'https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=600&q=80',
        tags: ['Nukkad Natak', 'Dramatics', 'Street Play'],
        position: 22,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-24',
        archiveId: riverdaleId,
        name: 'Manav Khurana',
        nickname: 'Rock Band Lead',
        groupLabel: 'CSE & Data Science',
        quote: '‘One tuned guitar on the hostel terrace could unite four hundred hostelites in five minutes.’',
        memory: 'The farewell concert night when the entire batch sang ‘Purani Jeans’ with our phone flashlights raised high.',
        imageUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=600&q=80',
        tags: ['Guitarist', 'Band Lead', 'Hostel Terrace'],
        position: 23,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-25',
        archiveId: riverdaleId,
        name: 'Swati Rao',
        nickname: 'Dance Troop Lead',
        groupLabel: 'Civil & Architecture',
        quote: '‘Synchronized steps, bruised knees, and glittering costumes under stage spotlights.’',
        memory: 'Winning the Western Dance championship trophy after three weeks of rehearsals until 2 AM in the gym.',
        imageUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80',
        tags: ['Choreographer', 'Dance Troop', 'Gym Rehearsals'],
        position: 24,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-26',
        archiveId: riverdaleId,
        name: 'Farhan Akhtar',
        nickname: 'Night Owl Admin',
        groupLabel: 'CSE & Data Science',
        quote: '‘Hostel Wi-Fi worked at lightning speed only between 3 AM and 5 AM.’',
        memory: 'Organizing the all-night counter-strike and FIFA tournament across four hostel wings on LAN.',
        imageUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=600&q=80',
        tags: ['Night Owl', 'Hostel LAN', 'FIFA Champion'],
        position: 25,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-27',
        archiveId: riverdaleId,
        name: 'Lavanya Mohan',
        nickname: 'Badminton Champion',
        groupLabel: 'ECE & Electronics',
        quote: '‘Smashing shuttlecocks at 6 AM was our ultimate stress buster before viva exams.’',
        memory: 'Unbeaten inter-university badminton doubles gold medal streak for three years straight.',
        imageUrl: 'https://images.unsplash.com/photo-1534751516642-a171edd2521d?auto=format&fit=crop&w=600&q=80',
        tags: ['Badminton Gold', 'Morning Court', 'Sports Club'],
        position: 26,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-28',
        archiveId: riverdaleId,
        name: 'Vikram Rathore',
        nickname: 'Goa Trip Captain',
        groupLabel: 'Mechanical Engineering',
        quote: '‘The Goa roadtrip that had nine breakdowns, zero regrets, and infinite stories.’',
        memory: 'Leading twenty bikes on the post-sixth-semester Goa trip and watching the sunrise over Chapora Fort.',
        imageUrl: 'https://images.unsplash.com/photo-1507152832244-10d45c7eda57?auto=format&fit=crop&w=600&q=80',
        tags: ['Royal Enfield', 'Goa Roadtrip', 'Biker'],
        position: 27,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-29',
        archiveId: riverdaleId,
        name: 'Sanjana Roy',
        nickname: 'Nature Club President',
        groupLabel: 'Civil & Architecture',
        quote: '‘Campus banyan tree shade was where the deepest friendships took root.’',
        memory: 'Planting 200 saplings across campus during our green drive and seeing them flourish over four years.',
        imageUrl: 'https://images.unsplash.com/photo-1519742866993-66d3cfef4bbd?auto=format&fit=crop&w=600&q=80',
        tags: ['Eco Club', 'Banyan Tree', 'Green Drive'],
        position: 28,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-30',
        archiveId: riverdaleId,
        name: 'Chirag Aggarwal',
        nickname: 'Midnight Chef',
        groupLabel: 'Design & Media',
        quote: '‘No meeting is productive without authentic Indore poha and jalebi.’',
        memory: 'Cooking midnight breakfast for seventy hostel friends during power-cut exam week using electric kettles.',
        imageUrl: 'https://images.unsplash.com/photo-1531891437562-4301cf0931ee?auto=format&fit=crop&w=600&q=80',
        tags: ['Kettle Master', 'Poha Lover', 'Hostel 3'],
        position: 29,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-31',
        archiveId: riverdaleId,
        name: 'Aditi Sharma',
        nickname: 'Poet & Slam Champion',
        groupLabel: 'Design & Media',
        quote: '‘Words captured what photographs sometimes could not.’',
        memory: 'Winning the North Zone inter-college slam poetry competition with a poem dedicated to our batch.',
        imageUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80',
        tags: ['Slam Poetry', 'Hindi Sahitya', 'Stage Lead'],
        position: 30,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-32',
        archiveId: riverdaleId,
        name: 'Kunal Meena',
        nickname: 'Formula Student Driver',
        groupLabel: 'Mechanical Engineering',
        quote: '‘Aerodynamics, telemetry, and 0 to 100 in 3.8 seconds on the Buddh International Circuit.’',
        memory: 'Driving our custom-built single-seater racecar across the finish line at Formula Bharat.',
        imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
        tags: ['Formula Bharat', 'Race Driver', 'Workshop Lead'],
        position: 31,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-33',
        archiveId: riverdaleId,
        name: 'Divya Nair',
        nickname: 'Class Representative',
        groupLabel: 'CSE & Data Science',
        quote: '‘Managing 80 engineering students was harder than training a deep neural network.’',
        memory: 'Convincing the strictest professor to postpone the submission deadline by 48 hours for the whole class.',
        imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
        tags: ['Class Rep', 'Negotiator', 'Dean Office'],
        position: 32,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-r-34',
        archiveId: riverdaleId,
        name: 'Ayush Tripathi',
        nickname: 'Philosophy & Debate Lead',
        groupLabel: 'Design & Media',
        quote: '‘Ghats, conversations, and the belief that ideas can change everything.’',
        memory: 'The 2 AM corridor debates that started about calculus and ended in the philosophy of human happiness.',
        imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
        tags: ['Corridor Debates', 'Design Thinker', 'Hostel 1'],
        position: 33,
        createdAt: '2026-04-01T12:00:00.000Z'
      }
    ];
    rMembers.forEach((m) => this.addMember(riverdaleId, m));

    // Media items for Riverdale (Realistic Indian Campus Life Moments)
    const rMedia: MediaItem[] = [
      {
        id: 'med-r-1',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        caption: 'Five minutes of studying and forty minutes of life conversations in the CS library reading hall.',
        tags: ['Library Hall', 'Study Group', 'Campus Life'],
        createdAt: '2026-04-05T10:00:00.000Z'
      },
      {
        id: 'med-r-2',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
        caption: 'The hackathon presentation that worked at 4 AM when everyone thought the demo was doomed.',
        tags: ['Lab Room Funs', 'Hackathons', 'All-Nighters'],
        createdAt: '2026-04-08T14:00:00.000Z'
      },
      {
        id: 'med-r-3',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=80',
        caption: 'Scribble Day: shirts covered in ink, signatures, phone numbers, and promises we intend to keep.',
        tags: ['Scribble Day', 'Farewell 2026', 'Traditions'],
        createdAt: '2026-04-12T11:00:00.000Z'
      },
      {
        id: 'med-r-4',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        caption: 'TechFest Cultural Night: 3,000 flashlights in the air during the final band performance.',
        tags: ['TechFest', 'Cultural Night', 'Concert'],
        createdAt: '2026-04-15T21:00:00.000Z'
      },
      {
        id: 'med-r-5',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=1200&q=80',
        caption: 'Canteen breakfast table: hot samosas, bun maska, and steaming cutting chai before 8 AM lecture.',
        tags: ['Canteen Chai', 'Samosa Club', 'Breakfast'],
        createdAt: '2026-04-18T08:30:00.000Z'
      },
      {
        id: 'med-r-6',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        caption: 'Convocation Ceremony: tossing black graduation caps into the sky on the main football quad.',
        tags: ['Convocation', 'Degree Day', 'Graduates'],
        createdAt: '2026-04-20T16:00:00.000Z'
      },
      {
        id: 'med-r-7',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=80',
        caption: 'Annual sports day cricket final: celebrating the victory trophy under golden hour campus skies.',
        tags: ['Cricket Trophy', 'Sports Day', 'Champions'],
        createdAt: '2026-04-22T17:30:00.000Z'
      },
      {
        id: 'med-r-8',
        archiveId: riverdaleId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        caption: 'Corridor discussions outside the dean’s office while waiting for final project approvals.',
        tags: ['Corridor', 'Project Review', 'Memories'],
        createdAt: '2026-04-25T13:00:00.000Z'
      }
    ];
    rMedia.forEach((med) => this.addMediaItem(riverdaleId, med));

    // Memory Wall for Riverdale
    const rWall: WallPost[] = [
      {
        id: 'wp-r-1',
        archiveId: riverdaleId,
        authorName: 'Prof. Mukherjee (HOD CSE)',
        text: 'You entered as chaotic debuggers and you leave as confident problem solvers. Keep building things that matter, and remember that our lab doors never close for you.',
        cardStyle: 'polaroid',
        isPinned: true,
        isApproved: true,
        likesCount: 64,
        createdAt: '2026-05-15T09:00:00.000Z'
      },
      {
        id: 'wp-r-2',
        archiveId: riverdaleId,
        authorName: 'Hostel 3 Boys',
        text: 'To the person who ordered midnight biryani during midterms and paid for the whole wing: legend status forever. See you all at the 5-year reunion!',
        cardStyle: 'sticky-yellow',
        isPinned: false,
        isApproved: true,
        likesCount: 47,
        createdAt: '2026-05-16T14:30:00.000Z'
      },
      {
        id: 'wp-r-3',
        archiveId: riverdaleId,
        authorName: 'Tapri Gang',
        text: 'We thought we were waiting for the weekend. We were actually living the good years. 8 semesters flew by like 8 minutes.',
        cardStyle: 'classic-paper',
        isPinned: false,
        isApproved: true,
        likesCount: 39,
        createdAt: '2026-05-17T18:20:00.000Z'
      }
    ];
    rWall.forEach((w) => this.addWallPost(riverdaleId, w));

    // =========================================================================
    // DEMO 3: St. Thomas Senior Secondary School — Class of 2024 (Warm Editorial)
    // =========================================================================
    const stThomasId = 'demo-st-thomas-2024';
    const stThomasArchive: Archive = {
      id: stThomasId,
      workspaceSlug: 'ws-st-thomas',
      slug: 'st-thomas-2024',
      title: 'St. Thomas Senior Secondary School — Class of 2024',
      organizationName: 'St. Thomas Senior Secondary School',
      subtitle: 'The bell rang. We stayed a little longer.',
      archiveType: 'school',
      startYear: 2012,
      endYear: 2024,
      batchLabel: 'Batch of 2024',
      approxPeopleCount: 6,
      themeId: 'aurora-glass',
      visibility: 'public',
      contributionMode: 'open',
      editorPinHash: samplePinHash,
      recoveryKeyHash: recoveryHash,
      deploymentStatus: 'deployed',
      publishedAt: '2024-04-30T12:00:00.000Z',
      createdAt: '2024-03-01T12:00:00.000Z',
      updatedAt: '2024-04-30T12:00:00.000Z',
      domainStatus: 'verified',
      settings: {
        allowAnonymousWall: true,
        requireWallApproval: false,
        allowMediaDownloads: true,
        allowMemberMessages: true,
        allowPublicSearch: true,
        enableProfanityFilter: false,
        enableBackgroundMusic: false,
        heroButtonText: 'Before We Went Our Separate Ways',
        heroSecondaryText: 'Open Heritage Archive',
        customClosingTitle: 'Not the End of the Story',
        customClosingNote: 'We left the campus, but not the memories, friendships and lessons that made those twelve years ours.'
      }
    };
    this.createArchive(stThomasArchive);

    this.setSections(stThomasId, [
      { id: 'sec-t-1', archiveId: stThomasId, stableType: 'hero', navigationLabel: 'Welcome', displayTitle: 'Before We Went Our Separate Ways', description: 'The bell rang. We stayed a little longer.', position: 0, isVisible: true },
      { id: 'sec-t-2', archiveId: stThomasId, stableType: 'timeline', navigationLabel: 'The First Page', displayTitle: 'The First Page', description: 'From nervous kindergarten steps to inter-school debate crowns.', layout: 'chapter-story', position: 1, isVisible: true },
      { id: 'sec-t-3', archiveId: stThomasId, stableType: 'members', navigationLabel: 'The Batch', displayTitle: 'Somewhere Between Classes', description: 'Science, Commerce, Humanities, Houses and Clubs.', position: 2, isVisible: true },
      { id: 'sec-t-4', archiveId: stThomasId, stableType: 'media-vault', navigationLabel: 'Vault', displayTitle: 'Small Moments, Big Archive', description: 'Inter-house rivalries, choir rehearsals, sports day trophies, and farewell speeches.', position: 3, isVisible: true },
      { id: 'sec-t-5', archiveId: stThomasId, stableType: 'memory-wall', navigationLabel: 'Wall', displayTitle: 'Notes We Never Said Out Loud', description: 'Teacher appreciation, house cheers, and nostalgia from the school gates.', position: 4, isVisible: true },
      { id: 'sec-t-6', archiveId: stThomasId, stableType: 'closing', navigationLabel: 'Epilogue', displayTitle: 'Not the End of the Story', description: 'The archive lives on. We carry the St. Thomas spirit wherever we go.', position: 5, isVisible: true }
    ]);

    // Timeline Events for St. Thomas
    const tTimeline: TimelineEvent[] = [
      {
        id: 'te-t-1',
        archiveId: stThomasId,
        yearLabel: '2012',
        title: 'The First Page',
        description: 'We entered as separate students and slowly became a class with its own language, routines and stories.',
        icon: '🌱',
        tags: ['First Grade', 'Heritage'],
        position: 0,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'te-t-2',
        archiveId: stThomasId,
        yearLabel: '2015',
        title: 'Somewhere Between Classes',
        description: 'The best memories were often made between lessons, during lunch breaks, on bus rides and while waiting for the final bell.',
        icon: '🏃',
        tags: ['Middle School', 'Games'],
        position: 1,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'te-t-3',
        archiveId: stThomasId,
        yearLabel: '2018',
        title: 'The Years That Shaped Us',
        description: 'We discovered our interests, our friendships and the confidence to imagine lives beyond the school gates.',
        icon: '🏆',
        tags: ['Inter-House', 'Debate'],
        position: 2,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'te-t-4',
        archiveId: stThomasId,
        yearLabel: '2022',
        title: 'Back in the Same Corridors',
        description: 'Returning to familiar classrooms reminded us how much had changed and how much still felt exactly the same.',
        icon: '✨',
        tags: ['Senior Wing', 'Prefects'],
        position: 3,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'te-t-5',
        archiveId: stThomasId,
        yearLabel: '2024',
        title: 'Not the End of the Story',
        description: 'We left the campus, but not the memories, friendships and lessons that made those years ours.',
        icon: '🕊️',
        tags: ['Farewell 2024', 'Alumni'],
        position: 4,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2024-03-01T12:00:00.000Z'
      }
    ];
    tTimeline.forEach((e) => this.addTimelineEvent(stThomasId, e));

    // Members for St. Thomas
    const tMembers: Member[] = [
      {
        id: 'mem-t-1',
        archiveId: stThomasId,
        name: 'Kabir Singhania',
        nickname: 'School Captain',
        groupLabel: 'Science',
        quote: '‘Leadership was never about the badge; it was about standing with everyone when it counted.’',
        memory: 'The annual inter-school quiz finals where we scored the winning point in sudden death.',
        imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
        tags: ['School Captain', 'Quiz Lead'],
        position: 0,
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-t-2',
        archiveId: stThomasId,
        name: 'Tara Varma',
        nickname: 'Choir Lead',
        groupLabel: 'Humanities',
        quote: '‘Music was the only thing that made 7:30 AM assemblies feel magical.’',
        memory: 'Harmonizing with sixty voices in the stone chapel for the Christmas carol service.',
        imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
        tags: ['Choir', 'Drama Club'],
        position: 1,
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-t-3',
        archiveId: stThomasId,
        name: 'Aditya Kapoor',
        nickname: 'Green House Prefect',
        groupLabel: 'Commerce',
        quote: '‘The corridor was noisy until the day it suddenly was not.’',
        memory: 'Lifting the Inter-House Overall Championship trophy on the main stage after four straight years.',
        imageUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80',
        tags: ['Green House', 'Cricket'],
        position: 2,
        createdAt: '2024-03-01T12:00:00.000Z'
      },
      {
        id: 'mem-t-4',
        archiveId: stThomasId,
        name: 'Nandini Roy',
        nickname: 'Debate President',
        groupLabel: 'Humanities',
        quote: '‘Words have power, but the silence after a goodbye holds even more.’',
        memory: 'The national mock UN competition in Delhi where the bus broke down and we rehearsed under the stars.',
        imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
        tags: ['Debate', 'Editorial'],
        position: 3,
        createdAt: '2024-03-01T12:00:00.000Z'
      }
    ];
    tMembers.forEach((m) => this.addMember(stThomasId, m));

    // Media for St. Thomas
    const tMedia: MediaItem[] = [
      {
        id: 'med-t-1',
        archiveId: stThomasId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
        caption: 'Morning assembly in the stone quadrangle, where generations learned to stand tall.',
        tags: ['Heritage', 'Assembly'],
        createdAt: '2024-03-05T10:00:00.000Z'
      },
      {
        id: 'med-t-2',
        archiveId: stThomasId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        caption: 'The Christmas Carol service illuminated by two hundred candles.',
        tags: ['Choir', 'Traditions'],
        createdAt: '2024-03-10T14:00:00.000Z'
      },
      {
        id: 'med-t-3',
        archiveId: stThomasId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        caption: 'Farewell ceremony 2024: tossing ties and caps under the banyan tree.',
        tags: ['Farewell 2024', 'Alumni'],
        createdAt: '2024-03-15T11:00:00.000Z'
      }
    ];
    tMedia.forEach((med) => this.addMediaItem(stThomasId, med));

    // Memory Wall for St. Thomas
    const tWall: WallPost[] = [
      {
        id: 'wp-t-1',
        archiveId: stThomasId,
        authorName: 'Mr. Mathew (Senior Vice Principal)',
        text: 'You came into these halls as children with restless curiosity, and you leave as compassionate scholars. You will forever be our pride.',
        cardStyle: 'polaroid',
        isPinned: true,
        isApproved: true,
        likesCount: 71,
        createdAt: '2024-04-15T09:00:00.000Z'
      },
      {
        id: 'wp-t-2',
        archiveId: stThomasId,
        authorName: 'Batch of ’24 Choir',
        text: 'The bells may stop ringing for us, but the hymn we sang together will never leave our hearts. Thank you St. Thomas for the most beautiful 12 years.',
        cardStyle: 'sticky-yellow',
        isPinned: false,
        isApproved: true,
        likesCount: 55,
        createdAt: '2024-04-16T14:30:00.000Z'
      }
    ];
    tWall.forEach((w) => this.addWallPost(stThomasId, w));

    // =========================================================================
    // DEMO 4: Batch 2022—26 (SISTec Bhopal) — Heritage Noir (Reference Theme)
    // =========================================================================
    const sistecId = 'demo-sistec-2026';
    const sistecArchive: Archive = {
      id: sistecId,
      workspaceSlug: 'ws-sistec-batch-26',
      slug: 'sistec-batch-2026',
      title: 'Batch 2022—26 · A Journey We’ll Always Carry',
      organizationName: 'SISTec Bhopal',
      subtitle: 'Four years of laughter, late nights, and lessons learned. Join us as we look back on the moments that defined us.',
      archiveType: 'college',
      startYear: 2022,
      endYear: 2026,
      batchLabel: 'Batch 2022—26',
      approxPeopleCount: 8,
      themeId: 'heritage-noir',
      visibility: 'public',
      contributionMode: 'open',
      editorPinHash: samplePinHash,
      recoveryKeyHash: recoveryHash,
      deploymentStatus: 'deployed',
      publishedAt: '2026-05-01T12:00:00.000Z',
      createdAt: '2026-04-01T12:00:00.000Z',
      updatedAt: '2026-05-01T12:00:00.000Z',
      domainStatus: 'verified',
      settings: {
        allowAnonymousWall: true,
        requireWallApproval: false,
        allowMediaDownloads: true,
        allowMemberMessages: true,
        allowPublicSearch: true,
        enableProfanityFilter: false,
        enableBackgroundMusic: false,
        heroButtonText: 'CLICK TO START THE JOURNEY',
        heroSecondaryText: 'VIEW THE CLASS OF ’26',
        customClosingTitle: 'A Journey We’ll Always Carry',
        customClosingNote: 'Four years went by in a heartbeat. The assignments are done, the presentations submitted, but the bonds we built will remain forever.'
      }
    };
    this.createArchive(sistecArchive);

    this.setSections(sistecId, [
      { id: 'sec-s-1', archiveId: sistecId, stableType: 'hero', navigationLabel: 'Batch ’26', displayTitle: 'Batch 2022—26', description: 'A Journey We’ll Always Carry', position: 0, isVisible: true },
      { id: 'sec-s-2', archiveId: sistecId, stableType: 'timeline', navigationLabel: 'The Journey', displayTitle: 'The Journey: 2022–2026', description: 'From the first hesitant hello to the final farewell stage.', layout: 'chapter-story', position: 1, isVisible: true },
      { id: 'sec-s-3', archiveId: sistecId, stableType: 'members', navigationLabel: 'Yearbook', displayTitle: 'The Class of ’26', description: 'Discover every department, branch, and classmate who made this campus unforgettable.', position: 2, isVisible: true },
      { id: 'sec-s-4', archiveId: sistecId, stableType: 'media-vault', navigationLabel: 'Media Vault', displayTitle: 'Vault of Memories', description: 'Touch or tap any photograph to zoom in, add personal notes, and remember the moments.', position: 3, isVisible: true },
      { id: 'sec-s-5', archiveId: sistecId, stableType: 'memory-wall', navigationLabel: 'The Wall', displayTitle: 'Message Wall of Reflection', description: 'Leave a handwritten note, farewell wish, or confession on the tape-pinned memory board.', position: 4, isVisible: true },
      { id: 'sec-s-6', archiveId: sistecId, stableType: 'closing', navigationLabel: 'Epilogue', displayTitle: 'Until We Meet Again', description: 'To the class of 2022–2026. Wherever life takes you, remember where you started.', position: 5, isVisible: true }
    ]);

    // Timeline Events for SISTec (Alternating story + polaroid photos)
    const sTimeline: TimelineEvent[] = [
      {
        id: 'te-s-1',
        archiveId: sistecId,
        yearLabel: '2022',
        title: 'The First Hello',
        description: '“Do you know where Hall B is?” That was the question that started it all. 120 strangers, nervous smiles, ID cards around our necks, and an orientation lecture nobody listened to.',
        icon: '👋',
        tags: ['Freshers’ Night', 'Orientation', 'Day One'],
        position: 0,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-s-2',
        archiveId: sistecId,
        yearLabel: '2023',
        title: 'Surviving the Grind & TechFest',
        description: 'Semester 3 hit us like a train. Mid-terms, lab manuals, and 2 AM coffee runs became our daily currency. Then Sagar Utsav happened, and we forgot all about backlogs for three glorious nights.',
        icon: '⚡',
        tags: ['Sagar Utsav', 'TechFest', 'Lab Viva'],
        position: 1,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-s-3',
        archiveId: sistecId,
        yearLabel: '2024',
        title: 'Built Between Deadlines',
        description: 'Third year was about proving ourselves. Hackathons across state borders, minor project prototypes that refused to compile, and the corner tapri that witnessed our biggest startup ideas.',
        icon: '💻',
        tags: ['Hackathons', 'Minor Project', 'Tapri Gang'],
        position: 2,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-s-4',
        archiveId: sistecId,
        yearLabel: '2025',
        title: 'Knowing Every Moment Was Becoming a Memory',
        description: 'Placement drives began, offer letters arrived, and the countdown started. Every bunked lecture, canteen samosa, and campus sunset felt heavier because we knew the time was running out.',
        icon: '☕',
        tags: ['Placement Drives', 'Golden Hour', 'Campus Rooftops'],
        position: 3,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'te-s-5',
        archiveId: sistecId,
        yearLabel: '2026',
        title: 'One Last Photograph Together',
        description: 'Scribble Day markers on white shirts, teary hugs, final project hand-ins, and a photograph in front of the main administrative porch that will outlive our college years.',
        icon: '🎓',
        tags: ['Scribble Day', 'Farewell 2026', 'Graduation'],
        position: 4,
        isDraft: false,
        mediaUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        createdAt: '2026-04-01T12:00:00.000Z'
      }
    ];
    sTimeline.forEach((e) => this.addTimelineEvent(sistecId, e));

    // Members for SISTec across diverse departments
    const sMembers: Member[] = [
      {
        id: 'mem-s-1',
        archiveId: sistecId,
        name: 'Aman Shrivastava',
        nickname: 'The Git Master & CR',
        groupLabel: 'CSE',
        quote: '‘Survived 8 semesters on Stack Overflow, Chai, and pure optimism.’',
        memory: 'Submitting our final capstone project at 11:59 PM with 2% laptop battery in the computer lab.',
        imageUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80',
        tags: ['CSE', 'Class Rep', 'Hackathons'],
        position: 0,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-2',
        archiveId: sistecId,
        name: 'Divya Raghuwanshi',
        nickname: 'Fest Convenor',
        groupLabel: 'CSE(AIDS)',
        quote: '‘If you didn’t see me in class, I was either in the auditorium or the canteen.’',
        memory: 'Managing 1,500 students during the cultural night dance showdown without a voice by 2 AM.',
        imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
        tags: ['CSE(AIDS)', 'Cultural Lead', 'Design'],
        position: 1,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-3',
        archiveId: sistecId,
        name: 'Harshvardhan Patel',
        nickname: 'Hardware Hacker',
        groupLabel: 'MECH',
        quote: '‘Theoretical torque is great, but have you seen our go-kart drift across the parking lot?’',
        memory: 'Welding the chassis till 4 AM for the national competition and celebrating with bun-maska.',
        imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80',
        tags: ['MECH', 'Robotics', 'Go-Kart'],
        position: 2,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-4',
        archiveId: sistecId,
        name: 'Rhea Malviya',
        nickname: 'Cyber Shield',
        groupLabel: 'CSE(CYBER)',
        quote: '‘I came for the degree, stayed for the midnight Wi-Fi speed.’',
        memory: 'Winning the 24-hour CTF cybersecurity shield in Pune with three hours of sleep.',
        imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
        tags: ['CSE(CYBER)', 'CTF Lead', 'Gaming'],
        position: 3,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-5',
        archiveId: sistecId,
        name: 'Utkarsh Chouhan',
        nickname: 'Proxy Specialist',
        groupLabel: 'EC',
        quote: '‘Attendance: 75% on ERP, 15% in reality. Balance in all things.’',
        memory: 'Giving three distinct roll call proxies in one single tutorial lecture while standing behind the door.',
        imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
        tags: ['EC', 'Tapri Gang', 'Football'],
        position: 4,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-6',
        archiveId: sistecId,
        name: 'Shreya Goswami',
        nickname: 'Placement Ace',
        groupLabel: 'CSE',
        quote: '‘The code failed 40 times. On slide 12 it worked. Never touch working code.’',
        memory: 'The whole batch cheering outside the interview room when the first FAANG placement dropped.',
        imageUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
        tags: ['CSE', 'Placement', 'Editorial'],
        position: 5,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-7',
        archiveId: sistecId,
        name: 'Nikhil Saxena',
        nickname: 'Bridge Builder',
        groupLabel: 'CIVIL',
        quote: '‘Concrete sets in 28 days. Our friendships were built for a lifetime.’',
        memory: 'Total station surveying under the scorching sun while guessing the contour levels.',
        imageUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80',
        tags: ['CIVIL', 'Survey Club', 'Cricket'],
        position: 6,
        createdAt: '2026-04-01T12:00:00.000Z'
      },
      {
        id: 'mem-s-8',
        archiveId: sistecId,
        name: 'Ananya Deshmukh',
        nickname: 'Maggi Master',
        groupLabel: 'EX',
        quote: '‘The hostel electric kettle has prepared more gourmet meals than any 5-star hotel.’',
        memory: 'Hostel block 2 terrace jamming with acoustic guitars under the Diwali full moon.',
        imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
        tags: ['EX', 'Hostel 2', 'Music'],
        position: 7,
        createdAt: '2026-04-01T12:00:00.000Z'
      }
    ];
    sMembers.forEach((m) => this.addMember(sistecId, m));

    // Media Vault for SISTec with rich classmate memory notes
    const sMedia: MediaItem[] = [
      {
        id: 'med-s-1',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
        caption: 'Freshers’ Night: the first time all 120 of us stood together in the college amphitheatre.',
        tags: ['Freshers', 'Batch 2026', 'Amphitheatre'],
        notes: [
          { id: 'mn-1', authorName: 'Aman', text: 'Remember when we didn’t even know each other’s names here!', createdAt: '2026-04-05T10:00:00.000Z' },
          { id: 'mn-2', authorName: 'Divya', text: 'Best night of our first year without a doubt 🎉', createdAt: '2026-04-06T12:30:00.000Z' }
        ],
        createdAt: '2026-04-05T10:00:00.000Z'
      },
      {
        id: 'med-s-2',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
        caption: 'Hackathon 4 AM debugging: four laptops, two power strips, and unlimited instant coffee.',
        tags: ['Hackathons', 'Lab All-Nighter', 'CS Lab'],
        notes: [
          { id: 'mn-3', authorName: 'Rhea', text: 'The bug was literally a missing semicolon on line 42 😭', createdAt: '2026-04-08T15:00:00.000Z' }
        ],
        createdAt: '2026-04-08T14:00:00.000Z'
      },
      {
        id: 'med-s-3',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=1200&q=80',
        caption: 'Scribble Day: shirts covered in ink, signatures, phone numbers, and unforgettable messages.',
        tags: ['Scribble Day', 'Farewell 2026', 'Traditions'],
        notes: [
          { id: 'mn-4', authorName: 'Utkarsh', text: 'Still keeping this shirt framed in my room forever!', createdAt: '2026-04-12T18:00:00.000Z' }
        ],
        createdAt: '2026-04-12T11:00:00.000Z'
      },
      {
        id: 'med-s-4',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
        caption: 'Sagar Utsav Cultural Night: 2,500 flashlights in the air during the band finale.',
        tags: ['Cultural Night', 'Sagar Utsav', 'Concert'],
        createdAt: '2026-04-15T21:00:00.000Z'
      },
      {
        id: 'med-s-5',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=1200&q=80',
        caption: 'Corner canteen: hot samosas, bun-maska, and steaming cutting chai before the morning lecture.',
        tags: ['Canteen Chai', 'Samosa Club', 'Breakfast'],
        createdAt: '2026-04-18T08:30:00.000Z'
      },
      {
        id: 'med-s-6',
        archiveId: sistecId,
        type: 'image',
        url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80',
        caption: 'Convocation Ceremony: tossing black graduation caps under the sunny campus sky.',
        tags: ['Convocation', 'Degree Day', 'Batch of 2026'],
        createdAt: '2026-04-20T16:00:00.000Z'
      }
    ];
    sMedia.forEach((med) => this.addMediaItem(sistecId, med));

    // Message Wall for SISTec (Taped sticky notes matching reference)
    const sWall: WallPost[] = [
      {
        id: 'wp-s-1',
        archiveId: sistecId,
        authorName: 'HOD Computer Science',
        text: 'From writing your first “Hello World” in C to deploying full-scale distributed systems, your journey has been nothing short of extraordinary. Carry the SISTec engineering spirit with pride.',
        cardStyle: 'polaroid',
        isPinned: true,
        isApproved: true,
        likesCount: 88,
        createdAt: '2026-04-25T09:00:00.000Z'
      },
      {
        id: 'wp-s-2',
        archiveId: sistecId,
        authorName: 'The Backbench Core',
        text: 'To everyone who shared assignments 10 minutes before the submission deadline: you are the real heroes of our degree. See you all at the 5-year reunion!',
        cardStyle: 'sticky-yellow',
        isPinned: false,
        isApproved: true,
        likesCount: 62,
        createdAt: '2026-04-26T14:30:00.000Z'
      },
      {
        id: 'wp-s-3',
        archiveId: sistecId,
        authorName: 'Anonymous Friend',
        text: 'I’ll never forget the rainy afternoon we spent under the library canopy talking about what our lives would look like in 2030. May we all find what we’re chasing.',
        cardStyle: 'classic-paper',
        isPinned: false,
        isApproved: true,
        likesCount: 45,
        createdAt: '2026-04-27T18:20:00.000Z'
      }
    ];
    sWall.forEach((w) => this.addWallPost(sistecId, w));
  }
}

export const db = new MemoryDatabase();
