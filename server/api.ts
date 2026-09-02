import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db';
import {
  createSignedToken,
  verifySignedToken,
  verifyArchivePin,
  verifyOwnerRecoveryKey,
  findArchiveAndVerifyKey
} from './auth';
import {
  Archive,
  Section,
  TimelineEvent,
  Member,
  MemberMessage,
  MediaItem,
  Album,
  WallPost,
  ArchiveSettings
} from '../src/types';
import { sanitizeSlug, validateSlug } from '../src/lib/tenant';
import { PLATFORM_CONFIG } from '../src/config/platform';

import { analyzeMemoryImage } from './ai';

export const apiRouter = express.Router();
apiRouter.use(express.json({ limit: '25mb' }));

function hasPlatformAdminAccess(req: Request) {
  const adminKey = process.env.PLATFORM_ADMIN_KEY;
  return Boolean(adminKey && req.header('x-platform-admin-key') === adminKey);
}

// Supabase is loaded before a route reads state. Responses wait for their
// snapshot to be saved, so a successful edit is durable before the browser is
// told that it succeeded.
apiRouter.use(async (_req, res, next) => {
  try {
    await db.ensureLoaded();
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      void db.persist()
        .then(() => sendJson(body))
        .catch((error) => {
          console.error('Failed to save archive data:', error);
          if (!res.headersSent) res.status(503);
          sendJson({ error: 'Unable to save archive data. Please try again.' });
        });
      return res;
    }) as typeof res.json;
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to extract and verify session from request
 */
function getAuthContext(req: Request): { archiveId?: string; role: 'owner' | 'contributor' | 'viewer' | 'none' } {
  const authHeader = req.headers.authorization;
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && typeof req.cookies === 'object') {
    const cookieToken = req.cookies.mc_owner_token || req.cookies.mc_editor_token;
    if (cookieToken) token = cookieToken;
  }

  // Also allow validation via x-workspace-slug header for direct active workspace owner requests
  const workspaceHeader = req.headers['x-workspace-slug'] as string;
  if (workspaceHeader) {
    const archive = db.findBySlug(workspaceHeader);
    if (archive) {
      return { archiveId: archive.id, role: 'owner' };
    }
  }

  // Also check x-archive-id header
  const archiveIdHeader = req.headers['x-archive-id'] as string;
  if (archiveIdHeader) {
    const archive = db.archives.get(archiveIdHeader);
    if (archive) {
      return { archiveId: archive.id, role: 'owner' };
    }
  }

  if (!token) return { role: 'none' };

  const verification = verifySignedToken(token);
  if (verification.valid && verification.archiveId && verification.role) {
    return { archiveId: verification.archiveId, role: verification.role };
  }

  // Check if session token exists directly in db.sessions
  const session = db.sessions.get(token);
  if (session && new Date(session.expiresAt).getTime() > Date.now()) {
    return { archiveId: session.archiveId, role: session.role };
  }

  return { role: 'none' };
}

/**
 * Extracts human-readable device and IP hints for access transparency logs
 */
function extractClientInfo(req: Request) {
  const ua = req.headers['user-agent'] || '';
  let device = 'Web Browser';
  if (/iPad|iPhone|iPod/.test(ua)) device = 'iOS Device';
  else if (/Android/.test(ua)) device = 'Android Device';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Linux/.test(ua)) device = 'Linux Device';

  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const ipHint = rawIp.split(',')[0].trim();

  return { device, ipHint };
}

/**
 * Sanitizes archive to never return sensitive hashes or private fields
 */
function sanitizeArchive(archive: Archive): Partial<Archive> {
  const { editorPinHash, viewerPinHash, recoveryKeyHash, ...safe } = archive;
  const members = db.getMembers(archive.id);
  const media = db.getMediaItems(archive.id);
  const actualMembersCount = members.length > 0 ? members.length : (archive.approxPeopleCount || 0);
  const actualMediaCount = media.length > 0 ? media.length : 0;
  return {
    ...safe,
    approxPeopleCount: actualMembersCount,
    membersCount: actualMembersCount,
    mediaCount: actualMediaCount
  };
}

// ==========================================
// 1. ARCHIVES MANAGEMENT & WORKSPACE CREATION
// ==========================================

// Create a new archive workspace (Step 5 in flow - BEFORE domain choice)
apiRouter.post('/archives', (req: Request, res: Response) => {
  try {
    const schema = z.object({
      archiveType: z.enum(['school', 'college', 'university', 'workplace', 'team', 'trip', 'reunion', 'club', 'custom']),
      title: z.string().min(2).max(100),
      organizationName: z.string().min(2).max(100),
      subtitle: z.string().max(300).optional(),
      startYear: z.number().int().min(1900).max(2100),
      endYear: z.number().int().min(1900).max(2100),
      batchLabel: z.string().max(50).optional(),
      approxPeopleCount: z.number().int().optional(),
      themeId: z.enum(['midnight-cinema', 'heritage-noir', 'aurora-glass', 'paper-polaroids', 'neon-afterglow', 'forest-chronicle']),
      visibility: z.enum(['public', 'unlisted', 'private']),
      contributionMode: z.enum(['owner-only', 'pin-protected', 'open']),
      editorPin: z.string().optional(),
      recoveryKey: z.string().min(10)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    }

    const data = parsed.data;

    // Generate unique internal workspace identifier
    const archiveId = `arc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const workspaceSlug = `ws-${Math.random().toString(36).substring(2, 10)}`;
    const defaultSlug = sanitizeSlug(data.title) || `archive-${Math.random().toString(36).substring(2, 6)}`;

    // Hash PIN if provided
    let editorPinHash: string | undefined = undefined;
    if (data.contributionMode === 'pin-protected' && data.editorPin) {
      editorPinHash = bcrypt.hashSync(data.editorPin.trim(), 10);
    }

    // Hash Recovery Key
    const recoveryKeyHash = bcrypt.hashSync(data.recoveryKey.trim(), 10);

    const defaultSettings: ArchiveSettings = {
      allowAnonymousWall: true,
      requireWallApproval: false,
      allowMediaDownloads: true,
      allowMemberMessages: true,
      allowPublicSearch: true,
      enableProfanityFilter: false,
      enableBackgroundMusic: false,
      heroButtonText: 'Step Back in Time',
      heroSecondaryText: 'Explore Our Story',
      customClosingTitle: 'Until We Meet Again',
      customClosingNote: 'Every chapter deserves a place to live.'
    };

    const newArchive: Archive = {
      id: archiveId,
      workspaceSlug,
      slug: defaultSlug,
      domainStatus: 'pending',
      title: data.title,
      organizationName: data.organizationName,
      subtitle: data.subtitle || '',
      archiveType: data.archiveType,
      startYear: data.startYear,
      endYear: data.endYear,
      batchLabel: data.batchLabel || `Class of ${data.endYear}`,
      approxPeopleCount: data.approxPeopleCount,
      themeId: data.themeId,
      visibility: data.visibility,
      contributionMode: data.contributionMode,
      editorPinHash,
      recoveryKeyHash,
      deploymentStatus: 'draft', // Created in draft workspace first!
      settings: defaultSettings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createArchive(newArchive);

    // Initialize default standard sections
    const defaultSections: Section[] = [
      { id: `sec-${archiveId}-1`, archiveId, stableType: 'hero', navigationLabel: 'Home', displayTitle: newArchive.title, description: newArchive.subtitle, position: 0, isVisible: true },
      { id: `sec-${archiveId}-2`, archiveId, stableType: 'timeline', navigationLabel: 'Our Journey', displayTitle: 'Our Journey', description: 'Milestones, breakthroughs, and unforgettable days.', layout: 'vertical-cinematic', position: 1, isVisible: true },
      { id: `sec-${archiveId}-3`, archiveId, stableType: 'members', navigationLabel: 'People', displayTitle: 'The People', description: 'The faces and voices that defined this era.', position: 2, isVisible: true },
      { id: `sec-${archiveId}-4`, archiveId, stableType: 'media-vault', navigationLabel: 'Media Vault', displayTitle: 'The Memory Vault', description: 'Photographs, candid snapshots, and recorded moments.', position: 3, isVisible: true },
      { id: `sec-${archiveId}-5`, archiveId, stableType: 'memory-wall', navigationLabel: 'Memory Wall', displayTitle: 'The Memory Wall', description: 'Leave your notes, inside jokes, and heartfelt messages.', position: 4, isVisible: true },
      { id: `sec-${archiveId}-6`, archiveId, stableType: 'closing', navigationLabel: 'Farewell', displayTitle: 'The Closing Note', description: 'A final tribute to this chapter.', position: 5, isVisible: true }
    ];

    db.setSections(archiveId, defaultSections, 'owner');

    // Create 30-day Owner Session Token
    const ownerToken = createSignedToken(archiveId, 'owner', 24 * 30);

    return res.status(201).json({
      success: true,
      archive: sanitizeArchive(newArchive),
      workspaceSlug,
      ownerToken
    });
  } catch (err: any) {
    console.error('Error creating archive:', err);
    return res.status(500).json({ error: 'Failed to create archive workspace.' });
  }
});

// List public archives for the Explore page
apiRouter.get('/archives', (_req: Request, res: Response) => {
  const archives = db.listPublicArchives().map(sanitizeArchive);
  return res.json({ archives });
});

apiRouter.get('/platform-settings', (_req: Request, res: Response) => {
  return res.json({ settings: db.getPlatformSettings() });
});

apiRouter.get('/admin/archives', (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) return res.status(403).json({ error: 'Platform owner access required.' });
  const archives = Array.from(db.archives.values())
    .filter((archive) => !archive.deletedAt)
    .map(sanitizeArchive);
  return res.json({ archives });
});

apiRouter.get('/admin/share-activity', (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) return res.status(403).json({ error: 'Platform owner access required.' });
  const activity = db.getShareActivity(undefined, 100).map((entry) => {
    const archive = db.findById(entry.archiveId);
    return {
      ...entry,
      archiveTitle: archive?.title || 'Deleted archive',
      archiveSlug: archive?.slug || archive?.workspaceSlug || ''
    };
  });
  return res.json({ activity });
});

// Read-only platform-owner preview for every archive, including drafts and
// private/unlisted pages. This never returns owner tokens, PIN hashes,
// recovery keys, or session credentials.
apiRouter.get('/admin/archives/:id/preview', (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) {
    return res.status(403).json({ error: 'Platform owner access required.' });
  }

  const archive = db.findById(req.params.id);
  if (!archive || archive.deletedAt) {
    return res.status(404).json({ error: 'Archive not found.' });
  }

  return res.json({
    archive: sanitizeArchive(archive),
    sections: db.getSections(archive.id),
    timeline: db.getTimelineEvents(archive.id),
    members: db.getMembers(archive.id),
    media: db.getMediaItems(archive.id),
    wall: db.getWallPosts(archive.id),
    albums: db.getAlbums(archive.id),
    readOnly: true
  });
});

apiRouter.put('/admin/platform-settings', (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) return res.status(403).json({ error: 'Platform owner access required.' });
  const { instagram, email, displayHandle } = req.body || {};
  if (instagram !== undefined && (typeof instagram !== 'string' || instagram.length > 300)) return res.status(400).json({ error: 'Instagram link is invalid.' });
  if (email !== undefined && (typeof email !== 'string' || email.length > 160)) return res.status(400).json({ error: 'Email is invalid.' });
  if (displayHandle !== undefined && (typeof displayHandle !== 'string' || displayHandle.length > 80)) return res.status(400).json({ error: 'Display handle is invalid.' });
  return res.json({ settings: db.updatePlatformSettings({ instagram, email, displayHandle }) });
});

// Lookup archive by public slug OR workspace slug
apiRouter.get('/archives/by-slug/:slug', (req: Request, res: Response) => {
  const { slug } = req.params;
  const archive = db.findBySlug(slug);
  if (!archive) {
    return res.status(404).json({ error: 'Memory archive not found.' });
  }

  // Load all associated tenant data
  const sections = db.getSections(archive.id);
  const timeline = db.getTimelineEvents(archive.id);
  const members = db.getMembers(archive.id);
  const media = db.getMediaItems(archive.id);
  const wall = db.getWallPosts(archive.id);
  const albums = db.getAlbums(archive.id);

  return res.json({
    archive: sanitizeArchive(archive),
    sections,
    timeline,
    members,
    media,
    wall,
    albums
  });
});

// Lookup archive by workspace slug (direct alias for workspace editor)
apiRouter.get('/archives/by-workspace/:workspaceSlug', (req: Request, res: Response) => {
  const { workspaceSlug } = req.params;
  const archive = db.findBySlug(workspaceSlug);
  if (!archive) {
    return res.status(404).json({ error: 'Workspace memory archive not found.' });
  }

  const sections = db.getSections(archive.id);
  const timeline = db.getTimelineEvents(archive.id);
  const members = db.getMembers(archive.id);
  const media = db.getMediaItems(archive.id);
  const wall = db.getWallPosts(archive.id);
  const albums = db.getAlbums(archive.id);

  // Generate private owner authorization token for this workspace session
  const ownerToken = createSignedToken(archive.id, 'owner', 24 * 30);

  return res.json({
    archive: sanitizeArchive(archive),
    sections,
    timeline,
    members,
    media,
    wall,
    albums,
    ownerToken
  });
});

// AI Multimodal Memory Image Analyzer
apiRouter.post('/ai/analyze-image', async (req: Request, res: Response) => {
  try {
    const { image, contextHint, archiveType } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Image data or URL is required.' });
    }

    const analysis = await analyzeMemoryImage(image, contextHint, archiveType);
    return res.json({ success: true, analysis });
  } catch (error: any) {
    console.error('Failed to analyze image with AI:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze memory image.' });
  }
});

// Lookup archive by ID
apiRouter.get('/archives/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const archive = db.findById(id);
  if (!archive) {
    return res.status(404).json({ error: 'Archive not found.' });
  }

  const sections = db.getSections(archive.id);
  const timeline = db.getTimelineEvents(archive.id);
  const members = db.getMembers(archive.id);
  const media = db.getMediaItems(archive.id);
  const wall = db.getWallPosts(archive.id);
  const albums = db.getAlbums(archive.id);

  return res.json({
    archive: sanitizeArchive(archive),
    sections,
    timeline,
    members,
    media,
    wall,
    albums
  });
});

// Update archive details (owner only for settings/permissions, contributor for safe fields)
apiRouter.patch('/archives/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);

  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied. Please verify your access.' });
  }

  const updates: Partial<Archive> = {};
  const body = req.body;

  // Fields both owner & contributor can modify
  if (body.title) updates.title = body.title;
  if (body.organizationName) updates.organizationName = body.organizationName;
  if (body.subtitle !== undefined) updates.subtitle = body.subtitle;
  if (body.themeId) updates.themeId = body.themeId;
  if (body.batchLabel !== undefined) updates.batchLabel = body.batchLabel;
  if (body.settings) updates.settings = { ...db.findById(id)?.settings, ...body.settings } as any;

  // Owner-only fields
  if (auth.role === 'owner') {
    if (body.visibility) updates.visibility = body.visibility;
    if (body.contributionMode) updates.contributionMode = body.contributionMode;
    if (body.editorPin) {
      updates.editorPinHash = bcrypt.hashSync(body.editorPin.trim(), 10);
    }
  }

  const updated = db.updateArchive(id, updates, auth.role);
  if (!updated) return res.status(404).json({ error: 'Archive not found.' });

  // Log successful edit in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'editor_save',
    actorRole: auth.role === 'owner' ? 'owner' : 'contributor',
    summary: 'Archive Settings & Content Saved',
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({ success: true, archive: sanitizeArchive(updated) });
});

// ==========================================
// 2. SLUG AVAILABILITY & FINAL DEPLOYMENT (LAST STEP)
// ==========================================

// Check slug availability with alternatives suggestion
apiRouter.get('/domains/check-slug', (req: Request, res: Response) => {
  const rawSlug = (req.query.slug as string) || '';
  const currentArchiveId = (req.query.archiveId as string) || undefined;
  const slug = sanitizeSlug(rawSlug);

  const validation = validateSlug(slug);
  if (!validation.valid) {
    return res.json({
      slug,
      available: false,
      reason: validation.error
    });
  }

  const available = db.isSlugAvailable(slug, currentArchiveId);
  if (available) {
    return res.json({ slug, available: true });
  }

  // Generate alternatives if taken
  const base = slug.replace(/-\d+$/, '');
  const alternatives = [
    `${base}-class-${new Date().getFullYear()}`,
    `${base}-batch`,
    `${base}-memories`,
    `${base}-archive`,
    `${base}-story`
  ].filter((alt) => db.isSlugAvailable(alt, currentArchiveId));

  return res.json({
    slug,
    available: false,
    reason: 'This address is already in use by another archive.',
    suggestedAlternatives: alternatives.slice(0, 4)
  });
});

// Custom Domain DNS Verification Simulator
apiRouter.post('/domains/verify', (req: Request, res: Response) => {
  const { domain, archiveId } = req.body;
  if (!domain || !archiveId) {
    return res.status(400).json({ error: 'Domain and Archive ID required.' });
  }

  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  
  // Format check
  if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,10}$/.test(cleanDomain)) {
    return res.status(400).json({
      verified: false,
      status: 'failed',
      error: 'Invalid domain format. Example: memories.yourinstitution.edu'
    });
  }

  // Domain verification mock response with realistic DNS instructions
  return res.json({
    verified: true,
    status: 'verified',
    domain: cleanDomain,
    cnameTarget: 'cname.oncehere.app',
    message: 'DNS configuration verified successfully.'
  });
});

// Final deployment step: ONLY called immediately before publishing!
apiRouter.post('/archives/:id/deploy', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);

  if (auth.archiveId !== id || auth.role !== 'owner') {
    return res.status(403).json({ error: 'Only the archive owner can deploy or publish the website.' });
  }

  const { finalSlug, customDomain } = req.body;
  const cleanSlug = sanitizeSlug(finalSlug || '');

  const val = validateSlug(cleanSlug);
  if (!val.valid) {
    return res.status(400).json({ error: val.error });
  }

  // Atomic availability re-check on server
  if (!db.isSlugAvailable(cleanSlug, id)) {
    return res.status(409).json({ error: 'The requested address was claimed just now. Please pick an alternative.' });
  }

  const updates: Partial<Archive> = {
    slug: cleanSlug,
    customDomain: customDomain ? customDomain.trim() : undefined,
    domainStatus: 'verified',
    deploymentStatus: 'deployed',
    publishedAt: new Date().toISOString()
  };

  const deployed = db.updateArchive(id, updates, 'owner');
  if (!deployed) return res.status(404).json({ error: 'Archive not found.' });

  // Log deployment in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'deploy_attempt',
    actorRole: 'owner',
    summary: `Live Deployment Published to /s/${cleanSlug}`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({
    success: true,
    archive: sanitizeArchive(deployed),
    publicUrl: `/s/${cleanSlug}`,
    subdomainUrl: `https://${cleanSlug}.oncehere.app`
  });
});

// Unpublish archive
apiRouter.post('/archives/:id/unpublish', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);

  if (auth.archiveId !== id || auth.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can unpublish this archive.' });
  }

  const updated = db.updateArchive(id, { deploymentStatus: 'unpublished' }, 'owner');
  return res.json({ success: true, archive: sanitizeArchive(updated!) });
});

// Delete archive (soft delete)
apiRouter.delete('/archives/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);

  if (auth.archiveId !== id || auth.role !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can delete this archive.' });
  }

  const success = db.deleteArchive(id);
  return res.json({ success });
});

// Platform-owner deletion. This is intentionally separate from archive-owner
// deletion: only the private Render environment variable can authorize it.
apiRouter.delete('/admin/archives/:id', (req: Request, res: Response) => {
  if (!process.env.PLATFORM_ADMIN_KEY) {
    return res.status(503).json({ error: 'Platform admin access has not been configured.' });
  }
  if (!hasPlatformAdminAccess(req)) {
    return res.status(403).json({ error: 'Platform owner access required.' });
  }

  const success = db.deleteArchive(req.params.id);
  if (!success) return res.status(404).json({ error: 'Archive not found.' });
  return res.json({ success: true });
});

apiRouter.post('/admin/archives/:id/unpublish', (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) return res.status(403).json({ error: 'Platform owner access required.' });
  const archive = db.updateArchive(req.params.id, { deploymentStatus: 'unpublished' }, 'owner');
  if (!archive) return res.status(404).json({ error: 'Archive not found.' });
  return res.json({ success: true, archive: sanitizeArchive(archive) });
});

// Hide or restore an archive in Explore without changing its public URL or
// publication state. Unhiding also repairs archives hidden by the legacy
// owner-tool action, which used to mark them as unpublished.
apiRouter.post('/admin/archives/:id/explore-visibility', (req: Request, res: Response) => {
  if (!process.env.PLATFORM_ADMIN_KEY) {
    return res.status(503).json({ error: 'Platform admin access has not been configured.' });
  }
  if (!hasPlatformAdminAccess(req)) {
    return res.status(403).json({ error: 'Platform owner access required.' });
  }

  const existing = db.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Archive not found.' });
  if (existing.id.startsWith('demo-')) {
    return res.status(403).json({ error: 'Demo archives are protected.' });
  }

  const parsed = z.object({ isHiddenFromExplore: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Explore visibility value is invalid.' });
  }

  const updates: Partial<Archive> = {
    isHiddenFromExplore: parsed.data.isHiddenFromExplore
  };

  if (!parsed.data.isHiddenFromExplore && existing.deploymentStatus === 'unpublished') {
    updates.deploymentStatus = 'deployed';
  }

  const archive = db.updateArchive(req.params.id, updates, 'owner');
  return res.json({ success: true, archive: sanitizeArchive(archive!) });
});

// ==========================================
// 3. AUTHENTICATION & ACCESS AUDIT LOGS
// ==========================================

// Get Access History for the archive (Last 5 PIN entries or edit attempts)
apiRouter.get('/archives/:id/access-history', (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
  const safeLimit = isNaN(limit) ? 5 : Math.min(Math.max(limit, 1), 20);
  
  const logs = db.getAccessLogs(id, safeLimit);
  return res.json({ success: true, logs });
});

// Verify contributor PIN with Rate Limiting (max 5 failed attempts per 15 min)
apiRouter.post('/archives/:id/auth/pin', (req: Request, res: Response) => {
  const { id } = req.params;
  const { pin } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'client';

  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'Numeric PIN is required.' });
  }

  const result = verifyArchivePin(id, pin, ip);
  if (!result.success) {
    return res.status(401).json({ error: result.error, lockedUntil: result.lockedUntil });
  }

  // Log successful PIN entry
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'pin_entry',
    actorRole: 'contributor',
    summary: 'Successful Contributor PIN Entry',
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({ success: true, token: result.token });
});

// Verify owner recovery key (by specific ID)
apiRouter.post('/archives/:id/auth/recovery', (req: Request, res: Response) => {
  const { id } = req.params;
  const { recoveryKey } = req.body;

  if (!recoveryKey || typeof recoveryKey !== 'string') {
    return res.status(400).json({ error: 'Recovery key is required.' });
  }

  const result = verifyOwnerRecoveryKey(id, recoveryKey);
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  // Log successful owner key recovery unlock
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'recovery_key_unlock',
    actorRole: 'owner',
    summary: 'Owner Recovery Key Authenticated',
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({ success: true, token: result.token });
});

// Universal Archive Key Access (Direct Owner Login)
apiRouter.post('/archives/auth/key-access', (req: Request, res: Response) => {
  const { key, identifier } = req.body;

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Please enter your Recovery Key or PIN.' });
  }

  const result = findArchiveAndVerifyKey(key, identifier);

  if (!result.success || !result.archive) {
    return res.status(401).json({
      success: false,
      error: result.error || 'Invalid Key or PIN. Please check your code and try again.'
    });
  }

  // Log access in archive's access history
  const clientInfo = extractClientInfo(req);
  const isPin = /^\d{4,8}$/.test((key || '').trim());
  db.addAccessLog(result.archive.id, {
    action: isPin ? 'pin_entry' : 'recovery_key_unlock',
    actorRole: 'owner',
    summary: isPin ? 'Scoped Archive PIN Verified' : 'Master Recovery Key Login',
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({
    success: true,
    token: result.token,
    workspaceSlug: result.archive.workspaceSlug,
    slug: result.archive.slug,
    archive: sanitizeArchive(result.archive)
  });
});

// ==========================================
// 4. SECTIONS MANAGEMENT
// ==========================================

apiRouter.get('/archives/:id/sections', (req: Request, res: Response) => {
  const { id } = req.params;
  const sections = db.getSections(id);
  return res.json({ sections });
});

apiRouter.put('/archives/:id/sections', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const { sections } = req.body;
  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: 'Invalid sections array.' });
  }

  const saved = db.setSections(id, sections, auth.role);

  // Log sections change
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'content_edit',
    actorRole: auth.role === 'owner' ? 'owner' : 'contributor',
    summary: `Updated Section Structure (${sections.length} sections)`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.json({ success: true, sections: saved });
});

// ==========================================
// 5. TIMELINE EVENTS
// ==========================================

apiRouter.get('/archives/:id/timeline', (req: Request, res: Response) => {
  const { id } = req.params;
  const events = db.getTimelineEvents(id);
  return res.json({ events });
});

apiRouter.post('/archives/:id/timeline', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  const archive = db.findById(id);

  if (!archive) return res.status(404).json({ error: 'Archive not found.' });

  // Open mode allows contribution, otherwise requires editor/owner session
  if (archive.contributionMode !== 'open' && (auth.archiveId !== id || auth.role === 'none')) {
    return res.status(403).json({ error: 'Permission denied. Please enter PIN to contribute.' });
  }

  const schema = z.object({
    title: z.string().min(2).max(100),
    description: z.string().min(2).max(1000),
    yearLabel: z.string().max(20),
    eventDate: z.string().optional(),
    icon: z.string().max(10).optional(),
    location: z.string().max(100).optional(),
    mediaUrl: z.string().optional(),
    tags: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
  }

  const event: TimelineEvent = {
    id: `te-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    archiveId: id,
    title: parsed.data.title,
    description: parsed.data.description,
    yearLabel: parsed.data.yearLabel,
    eventDate: parsed.data.eventDate,
    icon: parsed.data.icon || '📍',
    location: parsed.data.location,
    mediaUrl: parsed.data.mediaUrl,
    tags: parsed.data.tags || [],
    position: db.getTimelineEvents(id).length,
    isDraft: false,
    createdAt: new Date().toISOString()
  };

  db.addTimelineEvent(id, event);

  // Log edit in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'content_edit',
    actorRole: auth.role === 'owner' ? 'owner' : 'contributor',
    summary: `Added Timeline Milestone: "${event.title}"`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.status(201).json({ success: true, event });
});

apiRouter.patch('/archives/:id/timeline/:eventId', (req: Request, res: Response) => {
  const { id, eventId } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const updated = db.updateTimelineEvent(id, eventId, req.body);
  if (!updated) return res.status(404).json({ error: 'Event not found.' });
  return res.json({ success: true, event: updated });
});

apiRouter.delete('/archives/:id/timeline/:eventId', (req: Request, res: Response) => {
  const { id, eventId } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const success = db.deleteTimelineEvent(id, eventId);
  return res.json({ success });
});

// ==========================================
// 6. MEMBERS & YEARBOOK
// ==========================================

apiRouter.get('/archives/:id/members', (req: Request, res: Response) => {
  const { id } = req.params;
  const members = db.getMembers(id);
  return res.json({ members });
});

apiRouter.post('/archives/:id/members', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  const archive = db.findById(id);

  if (!archive) return res.status(404).json({ error: 'Archive not found.' });
  if (archive.contributionMode !== 'open' && (auth.archiveId !== id || auth.role === 'none')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const schema = z.object({
    name: z.string().min(1).max(80),
    nickname: z.string().max(50).optional(),
    imageUrl: z.string().optional(),
    groupLabel: z.string().max(50).optional(),
    quote: z.string().max(250).optional(),
    memory: z.string().max(500).optional(),
    tags: z.array(z.string()).optional(),
    socialLinks: z.record(z.string(), z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
  }

  const member: Member = {
    id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    archiveId: id,
    name: parsed.data.name,
    nickname: parsed.data.nickname,
    imageUrl: parsed.data.imageUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    groupLabel: parsed.data.groupLabel,
    quote: parsed.data.quote,
    memory: parsed.data.memory,
    tags: parsed.data.tags || [],
    socialLinks: parsed.data.socialLinks,
    position: db.getMembers(id).length,
    createdAt: new Date().toISOString()
  };

  db.addMember(id, member);

  // Log edit in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'content_edit',
    actorRole: auth.role === 'owner' ? 'owner' : 'contributor',
    summary: `Added Member Profile: "${member.name}"`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.status(201).json({ success: true, member });
});

apiRouter.patch('/archives/:id/members/:memberId', (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const updated = db.updateMember(id, memberId, req.body);
  if (!updated) return res.status(404).json({ error: 'Member not found.' });
  return res.json({ success: true, member: updated });
});

apiRouter.delete('/archives/:id/members/:memberId', (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const success = db.deleteMember(id, memberId);
  return res.json({ success });
});

// Member individual memory messages
apiRouter.get('/archives/:id/members/:memberId/messages', (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const messages = db.getMemberMessages(id, memberId);
  return res.json({ messages });
});

apiRouter.post('/archives/:id/members/:memberId/messages', (req: Request, res: Response) => {
  const { id, memberId } = req.params;
  const { authorName, text, visibility } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const msg: MemberMessage = {
    id: `mm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    archiveId: id,
    memberId,
    authorName: authorName ? authorName.trim() : 'Anonymous Friend',
    text: text.trim().substring(0, 300),
    visibility: visibility === 'private' ? 'private' : 'public',
    isHidden: false,
    createdAt: new Date().toISOString()
  };

  db.addMemberMessage(id, msg);
  return res.status(201).json({ success: true, message: msg });
});

// ==========================================
// 7. MEDIA VAULT & UPLOADS
// ==========================================

apiRouter.get('/archives/:id/media', (req: Request, res: Response) => {
  const { id } = req.params;
  const media = db.getMediaItems(id);
  const albums = db.getAlbums(id);
  return res.json({ media, albums });
});

apiRouter.post('/archives/:id/media', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  const archive = db.findById(id);

  if (!archive) return res.status(404).json({ error: 'Archive not found.' });
  if (archive.contributionMode !== 'open' && (auth.archiveId !== id || auth.role === 'none')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const { url, type, caption, altText, tags, albumId, notes } = req.body;
  if (!url) return res.status(400).json({ error: 'Media URL or payload required.' });

  const item: MediaItem = {
    id: `med-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    archiveId: id,
    type: type === 'video' ? 'video' : 'image',
    url,
    thumbnailUrl: url,
    caption: caption || '',
    altText: altText || caption || 'Archive memory photograph',
    tags: Array.isArray(tags) ? tags : [],
    notes: Array.isArray(notes) ? notes : [],
    albumId,
    createdAt: new Date().toISOString()
  };

  db.addMediaItem(id, item);

  // Log edit in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(id, {
    action: 'content_edit',
    actorRole: auth.role === 'owner' ? 'owner' : 'contributor',
    summary: `Uploaded ${item.type === 'video' ? 'Video' : 'Photo'} to Memory Vault`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.status(201).json({ success: true, item });
});

// Update media item details (caption, altText, tags, etc.)
apiRouter.patch('/archives/:id/media/:mediaId', (req: Request, res: Response) => {
  const { id, mediaId } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || (auth.role !== 'owner' && auth.role !== 'contributor')) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const updated = db.updateMediaItem(id, mediaId, req.body);
  if (!updated) return res.status(404).json({ error: 'Media item not found.' });
  return res.json({ success: true, item: updated });
});

// Add a memory note/comment to a specific photograph or video in the vault
apiRouter.post('/archives/:id/media/:mediaId/notes', (req: Request, res: Response) => {
  const { id, mediaId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const { authorName, text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Note text is required.' });
  }

  const cleanAuthor = (authorName && typeof authorName === 'string' && authorName.trim()) ? authorName.trim() : 'Classmate';
  const cleanText = text.trim().substring(0, 500);

  const result = db.addMediaNote(targetId, mediaId, {
    authorName: cleanAuthor,
    text: cleanText
  });

  if (!result || !result.item) return res.status(404).json({ error: 'Media item not found.' });
  return res.status(201).json({ success: true, item: result.item, note: result.note });
});

// Delete a memory note from a photograph in the vault
apiRouter.delete('/archives/:id/media/:mediaId/notes/:noteId', (req: Request, res: Response) => {
  const { id, mediaId, noteId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const updated = db.deleteMediaNote(targetId, mediaId, noteId);
  if (!updated) return res.status(404).json({ error: 'Note or media item not found.' });
  return res.json({ success: true, item: updated });
});

apiRouter.delete('/archives/:id/media/:mediaId', (req: Request, res: Response) => {
  const { id, mediaId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const auth = getAuthContext(req);
  if (auth.archiveId !== targetId && auth.archiveId !== id && auth.role !== 'owner' && auth.role !== 'contributor') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const success = db.deleteMediaItem(targetId, mediaId);
  return res.json({ success });
});

// ==========================================
// 8. MEMORY WALL
// ==========================================

apiRouter.get('/archives/:id/wall', (req: Request, res: Response) => {
  const { id } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const auth = getAuthContext(req);
  const isPrivileged = (auth.archiveId === targetId && (auth.role === 'owner' || auth.role === 'contributor'));
  const posts = db.getWallPosts(targetId, isPrivileged);
  return res.json({ posts });
});

apiRouter.post('/archives/:id/wall', (req: Request, res: Response) => {
  const { id } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  if (!archive) return res.status(404).json({ error: 'Archive not found.' });
  const targetId = archive.id;

  const { authorName, authorRole, text, cardStyle, imageUrl } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Note text cannot be empty.' });
  }

  if (text.length > PLATFORM_CONFIG.limits.maxWallMessageLength) {
    return res.status(400).json({ error: `Message cannot exceed ${PLATFORM_CONFIG.limits.maxWallMessageLength} characters.` });
  }

  const post: WallPost = {
    id: `wp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    archiveId: targetId,
    authorName: authorName ? authorName.trim() : 'Classmate',
    authorRole: authorRole ? authorRole.trim() : undefined,
    text: text.trim(),
    imageUrl: imageUrl ? imageUrl.trim() : undefined,
    cardStyle: cardStyle || 'polaroid',
    isPinned: false,
    isApproved: true,
    isHidden: false,
    likesCount: 0,
    createdAt: new Date().toISOString()
  };

  db.addWallPost(targetId, post);

  // Log edit in Access History
  const clientInfo = extractClientInfo(req);
  db.addAccessLog(targetId, {
    action: 'content_edit',
    actorRole: 'contributor',
    summary: `Posted Note to Memory Wall by "${post.authorName}"`,
    ipHint: clientInfo.ipHint,
    deviceInfo: clientInfo.device
  });

  return res.status(201).json({ success: true, post });
});

apiRouter.patch('/archives/:id/wall/:postId', (req: Request, res: Response) => {
  const { id, postId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const auth = getAuthContext(req);
  const isDemo = targetId.startsWith('demo-') || (archive && ['sistec-batch-2026', 'riverdale-tech-2026', 'marys-convent-2025', 'st-thomas-2024'].includes(archive.slug));

  if (!isDemo && auth.archiveId !== targetId && auth.role !== 'owner' && auth.role !== 'contributor') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const { isHidden, isApproved, isPinned } = req.body;
  const updates: Partial<WallPost> = {};
  if (typeof isHidden === 'boolean') updates.isHidden = isHidden;
  if (typeof isApproved === 'boolean') updates.isApproved = isApproved;
  if (typeof isPinned === 'boolean') updates.isPinned = isPinned;

  const updated = db.updateWallPost(targetId, postId, updates);
  if (!updated) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ success: true, post: updated });
});

apiRouter.post('/archives/:id/wall/:postId/like', (req: Request, res: Response) => {
  const { id, postId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const updated = db.likeWallPost(targetId, postId);
  if (!updated) return res.status(404).json({ error: 'Post not found.' });
  return res.json({ success: true, likesCount: updated.likesCount });
});

apiRouter.delete('/archives/:id/wall/:postId', (req: Request, res: Response) => {
  const { id, postId } = req.params;
  const archive = db.findById(id) || db.findBySlug(id);
  const targetId = archive ? archive.id : id;
  const auth = getAuthContext(req);
  const isDemo = targetId.startsWith('demo-') || (archive && ['sistec-batch-2026', 'riverdale-tech-2026', 'marys-convent-2025', 'st-thomas-2024'].includes(archive.slug));

  if (!isDemo && auth.archiveId !== targetId && auth.role !== 'owner' && auth.role !== 'contributor') {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const success = db.deleteWallPost(targetId, postId);
  return res.json({ success });
});

// ==========================================
// 9. REVISION HISTORY & RESTORE
// ==========================================

apiRouter.get('/archives/:id/revisions', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  const archive = db.findById(id);
  if (!archive) {
    return res.status(404).json({ error: 'Archive not found.' });
  }

  if (auth.archiveId && auth.archiveId !== id) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const revisions = db.getRevisions(id);
  return res.json({ revisions });
});

apiRouter.post('/archives/:id/revisions/:revId/restore', (req: Request, res: Response) => {
  const { id, revId } = req.params;
  const auth = getAuthContext(req);
  const archive = db.findById(id);
  if (!archive) {
    return res.status(404).json({ error: 'Archive not found.' });
  }

  if (auth.archiveId && auth.archiveId !== id) {
    return res.status(403).json({ error: 'Permission denied.' });
  }

  const success = db.restoreRevision(id, revId);
  return res.json({ success });
});

// ==========================================
// 10. EXPORT DATA (JSON BUNDLE)
// ==========================================

apiRouter.get('/archives/:id/export', (req: Request, res: Response) => {
  const { id } = req.params;
  const auth = getAuthContext(req);
  if (auth.archiveId !== id || auth.role !== 'owner') {
    return res.status(403).json({ error: 'Only the archive owner can export archive data.' });
  }

  const archive = db.findById(id);
  if (!archive) return res.status(404).json({ error: 'Archive not found.' });

  const exportPayload = {
    version: '1.0',
    platform: PLATFORM_CONFIG.name,
    exportedAt: new Date().toISOString(),
    archive: sanitizeArchive(archive),
    sections: db.getSections(id),
    timeline: db.getTimelineEvents(id),
    members: db.getMembers(id),
    media: db.getMediaItems(id),
    wall: db.getWallPosts(id),
    albums: db.getAlbums(id)
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${archive.slug}-export.json"`);
  return res.send(JSON.stringify(exportPayload, null, 2));
});

// ==========================================
// 11. PRIVACY-SAFE ANALYTICS
// ==========================================

apiRouter.post('/analytics', (req: Request, res: Response) => {
  const { eventName, archiveId, metadata } = req.body || {};
  if (eventName === 'archive_share_action') {
    const channels = ['instagram_story', 'instagram_post', 'whatsapp', 'whatsapp_status', 'native', 'copy_link', 'other'] as const;
    const actions = ['opened', 'copied', 'downloaded', 'shared'] as const;
    if (typeof archiveId !== 'string' || !db.findById(archiveId)) {
      return res.status(400).json({ error: 'Valid archive is required.' });
    }
    if (!channels.includes(metadata?.channel) || !actions.includes(metadata?.action)) {
      return res.status(400).json({ error: 'Invalid share activity.' });
    }
    db.addShareActivity(archiveId, metadata.channel, metadata.action);
  }
  // Privacy safe logging - no sensitive strings recorded
  console.log(`[Analytics] Event: ${eventName} | Archive: ${archiveId || 'platform'} | Time: ${new Date().toISOString()}`);
  return res.json({ recorded: true });
});
