import express, { Request, Response } from 'express';
import { db } from './db.js';
import { mediaCdnStatus } from './mediaCdn.js';
import { checkStorageConnection, getPlatformStorageUsage, R2_LIMITS } from './r2.js';
import { getRuntimeReadiness } from './runtime-config.js';

export const adminHealthRouter = express.Router();

const STORAGE_CACHE_MS = 2 * 60 * 1000;
let storageCache: { expiresAt: number; bytes: number; objects: number } | undefined;

function hasPlatformAdminAccess(req: Request): boolean {
  const expected = process.env.PLATFORM_ADMIN_KEY?.trim();
  return Boolean(expected && req.header('x-platform-admin-key') === expected);
}

function buildCommit(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT
    || process.env.COMMIT_SHA
    || 'local';
}

function storageProvider(): string {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim() || '';
  if (/backblazeb2\.com/i.test(endpoint)) return 'Backblaze B2';
  if (/r2\.cloudflarestorage\.com/i.test(endpoint) || process.env.R2_ACCOUNT_ID) return 'Cloudflare R2';
  return endpoint ? 'S3-compatible object storage' : 'Not configured';
}

function storageBudget(): { bytes: number | null; source: string; note?: string } {
  const configured = Number(process.env.OBJECT_STORAGE_BUDGET_BYTES);
  if (Number.isFinite(configured) && configured > 0) {
    return { bytes: Math.floor(configured), source: 'Configured OnceHere storage budget' };
  }

  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim() || '';
  if (/backblazeb2\.com/i.test(endpoint)) {
    return {
      bytes: 10_000_000_000,
      source: 'Backblaze B2 free-tier reference',
      note: 'Backblaze describes the first 10 GB as free account-wide. OnceHere can measure this configured bucket, not storage used by any other B2 buckets in the same account.'
    };
  }

  return {
    bytes: null,
    source: 'No platform storage budget configured',
    note: 'Set OBJECT_STORAGE_BUDGET_BYTES if you want remaining-capacity percentages for this provider.'
  };
}

async function cachedStorageUsage() {
  const now = Date.now();
  if (storageCache && storageCache.expiresAt > now) return storageCache;
  const usage = await getPlatformStorageUsage();
  storageCache = { ...usage, expiresAt: now + STORAGE_CACHE_MS };
  return storageCache;
}

function percent(used: number, total: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.round((used / total) * 10_000) / 100);
}

adminHealthRouter.get('/admin/health', async (req: Request, res: Response) => {
  if (!hasPlatformAdminAccess(req)) {
    return res.status(403).json({ error: 'Platform owner access required.' });
  }

  const readiness = getRuntimeReadiness();
  let databaseIndexLoaded = false;
  let databaseError: string | undefined;
  try {
    await db.ensureLoaded();
    databaseIndexLoaded = true;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : 'Database index could not be loaded.';
  }

  const storageConnection = await checkStorageConnection();
  let storageUsage = { bytes: 0, objects: 0 };
  let storageUsageError: string | undefined;
  if (storageConnection.connected) {
    try {
      storageUsage = await cachedStorageUsage();
    } catch (error) {
      storageUsageError = error instanceof Error ? error.message : 'Storage usage could not be measured.';
    }
  }

  const budget = storageBudget();
  const usedPercent = percent(storageUsage.bytes, budget.bytes);
  const remainingBytes = budget.bytes == null ? null : Math.max(0, budget.bytes - storageUsage.bytes);
  const archives = Array.from(db.archives.values()).filter((archive) => !archive.deletedAt);
  const archiveCounts = {
    total: archives.length,
    deployed: archives.filter((archive) => archive.deploymentStatus === 'deployed').length,
    draft: archives.filter((archive) => archive.deploymentStatus === 'draft').length,
    unpublished: archives.filter((archive) => archive.deploymentStatus === 'unpublished').length,
    public: archives.filter((archive) => archive.visibility === 'public').length,
    unlisted: archives.filter((archive) => archive.visibility === 'unlisted').length,
    private: archives.filter((archive) => archive.visibility === 'private').length,
    hiddenFromExplore: archives.filter((archive) => Boolean(archive.isHiddenFromExplore)).length
  };

  const cdn = mediaCdnStatus();
  const issues: Array<{ level: 'critical' | 'warning' | 'info'; message: string }> = [];
  if (!readiness.services.turso || !databaseIndexLoaded) {
    issues.push({ level: 'critical', message: databaseError || 'Durable database is not ready.' });
  }
  if (!readiness.services.sessionSigning) {
    issues.push({ level: 'critical', message: 'Session signing is not configured.' });
  }
  if (!storageConnection.connected) {
    issues.push({ level: 'critical', message: `Object storage is not reachable${storageConnection.code ? ` (${storageConnection.code})` : ''}.` });
  }
  if (storageUsageError) {
    issues.push({ level: 'warning', message: `Storage is connected, but usage measurement failed: ${storageUsageError}` });
  }
  if (usedPercent != null && usedPercent >= 95) {
    issues.push({ level: 'critical', message: `OnceHere bucket usage is at ${usedPercent}% of the displayed storage reference.` });
  } else if (usedPercent != null && usedPercent >= 80) {
    issues.push({ level: 'warning', message: `OnceHere bucket usage is at ${usedPercent}% of the displayed storage reference.` });
  }
  if (budget.bytes == null) {
    issues.push({ level: 'info', message: 'No storage budget is configured, so remaining-capacity percentage is unavailable.' });
  }
  if (!cdn.enabled) {
    issues.push({ level: 'info', message: 'Media CDN is intentionally disabled; signed object-storage delivery remains active.' });
  }

  const critical = issues.some((issue) => issue.level === 'critical');
  const warning = issues.some((issue) => issue.level === 'warning');
  const status = critical ? 'degraded' : warning ? 'attention' : 'healthy';
  const settings = db.getPlatformSettings();

  res.setHeader('Cache-Control', 'private, no-store');
  return res.json({
    status,
    checkedAt: new Date().toISOString(),
    deployment: {
      provider: readiness.provider,
      buildCommit: buildCommit(),
      environment: process.env.NODE_ENV || 'development'
    },
    services: {
      databaseConfigured: readiness.services.turso,
      databaseIndexLoaded,
      sessionSigning: readiness.services.sessionSigning,
      objectStorageConfigured: readiness.services.objectStorage,
      objectStorageConnected: storageConnection.connected,
      mediaCdnEnabled: cdn.enabled
    },
    storage: {
      provider: storageProvider(),
      usedBytes: storageUsage.bytes,
      objectCount: storageUsage.objects,
      referenceBytes: budget.bytes,
      remainingBytes,
      usedPercent,
      referenceSource: budget.source,
      referenceNote: budget.note,
      perArchiveLimitBytes: R2_LIMITS.maxTotalBytesPerArchive
    },
    limits: {
      imageBytes: R2_LIMITS.imageBytes,
      videoBytes: R2_LIMITS.videoBytes,
      archiveVideos: R2_LIMITS.maxArchiveVideos,
      vaultAttachments: R2_LIMITS.maxVaultAttachments,
      journeyAttachments: R2_LIMITS.maxTimelineAttachments,
      yearbookPortraits: R2_LIMITS.maxMemberPortraits,
      wallImageAttachments: R2_LIMITS.maxWallImageAttachments
    },
    archives: archiveCounts,
    feedback: {
      emailConfigured: Boolean(settings.email),
      instagramConfigured: Boolean(settings.instagram),
      reportPage: '/report'
    },
    monitoring: {
      liveDependencyChecks: true,
      persistentRuntimeErrorHistory: false,
      note: 'Historical function/runtime errors remain in the active hosting provider logs. This page reports live configuration, connectivity, capacity and deterministic platform issues without exposing hosting credentials.'
    },
    issues
  });
});
