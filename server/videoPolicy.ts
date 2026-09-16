import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';
import { R2_LIMITS } from './r2.js';

const VIDEO_URL_RE = /(?:^data:video\/|\.(?:mp4|webm|mov|m4v|ogv)(?:[?#]|$))/i;

function isVideoUrl(value: unknown): boolean {
  return typeof value === 'string' && VIDEO_URL_RE.test(value);
}

export function archiveVideoCount(archiveId: string, exceptTimelineEventId?: string): number {
  const vaultVideos = db.getMediaItems(archiveId).filter((item) => item.type === 'video').length;
  const journeyVideos = db.getTimelineEvents(archiveId)
    .filter((event) => event.id !== exceptTimelineEventId && isVideoUrl(event.mediaUrl))
    .length;
  return vaultVideos + journeyVideos;
}

function rejectIfAtLimit(archiveId: string, res: Response, exceptTimelineEventId?: string) {
  if (archiveVideoCount(archiveId, exceptTimelineEventId) < R2_LIMITS.maxArchiveVideos) return false;
  res.status(413).json({
    error: `This archive already has its maximum of ${R2_LIMITS.maxArchiveVideos} videos across Journey and Media Vault.`
  });
  return true;
}

/**
 * Cross-section quota guard. The section-specific rules remain in api.ts; this
 * middleware prevents their independent allowances from exceeding the intended
 * archive-wide total. It runs before apiRouter and never grants authorization.
 */
export function enforceArchiveVideoLimit(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PATCH'].includes(req.method)) return next();

  const path = (req.originalUrl || req.url).split('?')[0];
  const match = path.match(/\/api\/archives\/([^/]+)\/(.+)$/);
  if (!match) return next();

  const archiveId = decodeURIComponent(match[1]);
  const action = match[2];

  // New Vault uploads can be rejected before object-storage bytes are sent.
  if (
    req.method === 'POST' &&
    action === 'media/upload-url' &&
    req.body?.purpose === 'vault' &&
    typeof req.body?.contentType === 'string' &&
    req.body.contentType.startsWith('video/')
  ) {
    if (rejectIfAtLimit(archiveId, res)) return;
    return next();
  }

  // Registering either an uploaded or externally hosted Vault video.
  if (req.method === 'POST' && action === 'media' && (req.body?.type === 'video' || isVideoUrl(req.body?.url))) {
    if (rejectIfAtLimit(archiveId, res)) return;
    return next();
  }

  // Creating a Journey milestone with a video.
  if (req.method === 'POST' && action === 'timeline' && isVideoUrl(req.body?.mediaUrl)) {
    if (rejectIfAtLimit(archiveId, res)) return;
    return next();
  }

  // Replacing a Journey video's URL is allowed at the cap because the current
  // event is excluded from the count. Turning a non-video milestone into a
  // video still consumes a new archive-wide slot.
  const timelinePatch = action.match(/^timeline\/([^/]+)$/);
  if (req.method === 'PATCH' && timelinePatch && isVideoUrl(req.body?.mediaUrl)) {
    const eventId = decodeURIComponent(timelinePatch[1]);
    if (rejectIfAtLimit(archiveId, res, eventId)) return;
  }

  return next();
}
