import express, { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import {
  createSignedToken,
  findArchiveAndVerifyKey,
  normalizeRecoveryKeyInput,
  verifySignedToken
} from './auth.js';
import type { Archive } from '../src/types/index.js';

export const ownerKeyRouter = express.Router();

type ArchiveWithBackupKey = Archive & {
  /** Optional owner-created backup key. The original recoveryKeyHash is never replaced. */
  backupRecoveryKeyHash?: string;
};

type RecoveryKeyKind = 'master' | 'backup';

const RECOVERY_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_MAX_ATTEMPTS = 5;

function scrubSecretHashes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecretHashes);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (['recoveryKeyHash', 'backupRecoveryKeyHash', 'editorPinHash', 'viewerPinHash'].includes(key)) continue;
    result[key] = scrubSecretHashes(child);
  }
  return result;
}

/** Defense in depth: never let any credential hash escape through a JSON response. */
ownerKeyRouter.use((_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => sendJson(scrubSecretHashes(body))) as typeof res.json;
  next();
});

function clientInfo(req: Request) {
  const ua = req.headers['user-agent'] || '';
  let device = 'Web Browser';
  if (/iPad|iPhone|iPod/.test(ua)) device = 'iOS Device';
  else if (/Android/.test(ua)) device = 'Android Device';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Linux/.test(ua)) device = 'Linux Device';
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  return { device, ipHint: rawIp.split(',')[0].trim() };
}

function setOwnerCookie(res: Response, token: string) {
  res.cookie('mc_owner_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function ownerSessionFor(req: Request, archiveId: string): boolean {
  const bearer = req.headers.authorization;
  const candidates = [
    bearer?.startsWith('Bearer ') ? bearer.slice(7) : '',
    req.cookies?.mc_owner_token
  ].filter((token): token is string => Boolean(token));

  return candidates.some((token) => {
    const verified = verifySignedToken(token);
    return verified.valid && verified.archiveId === archiveId && verified.role === 'owner';
  });
}

function recoveryRateKey(req: Request) {
  return `recovery:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

function consumeRecoveryAttempt(req: Request, res: Response): boolean {
  const key = recoveryRateKey(req);
  const now = Date.now();
  let entry = db.rateLimits.get(key);
  if (!entry || now - entry.firstAttemptAt >= RECOVERY_WINDOW_MS) {
    entry = { attempts: 0, firstAttemptAt: now };
  }
  if (entry.attempts >= RECOVERY_MAX_ATTEMPTS) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.firstAttemptAt + RECOVERY_WINDOW_MS - now) / 1000)));
    res.status(429).json({ error: 'Too many recovery attempts. Wait 15 minutes before trying again.' });
    return false;
  }
  entry.attempts += 1;
  db.rateLimits.set(key, entry);
  return true;
}

function clearRecoveryAttempts(req: Request) {
  db.rateLimits.delete(recoveryRateKey(req));
}

async function matchRecoveryKey(archive: ArchiveWithBackupKey, rawKey: string): Promise<RecoveryKeyKind | null> {
  const key = normalizeRecoveryKeyInput(rawKey);
  if (!key) return null;
  if (archive.recoveryKeyHash && await bcrypt.compare(key, archive.recoveryKeyHash)) return 'master';
  if (archive.backupRecoveryKeyHash && await bcrypt.compare(key, archive.backupRecoveryKeyHash)) return 'backup';
  return null;
}

function generateBackupOwnerKey(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(24);
  let result = 'mc_rec_';
  for (let index = 0; index < bytes.length; index += 1) {
    result += chars[bytes[index] % chars.length];
    if (index % 6 === 5 && index !== bytes.length - 1) result += '-';
  }
  return result;
}

async function loadArchive(id: string): Promise<ArchiveWithBackupKey | undefined> {
  await db.ensureLoaded();
  const archive = db.findById(id) as ArchiveWithBackupKey | undefined;
  if (!archive) return undefined;
  await db.ensureArchiveLoaded(id);
  return db.findById(id) as ArchiveWithBackupKey | undefined;
}

// Specific archive recovery: both permanent master and current backup key work.
ownerKeyRouter.post('/archives/:id/auth/recovery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!consumeRecoveryAttempt(req, res)) return;
    const recoveryKey = req.body?.recoveryKey;
    if (!recoveryKey || typeof recoveryKey !== 'string' || recoveryKey.length > 512) {
      return res.status(400).json({ error: 'Recovery key is required.' });
    }

    const archive = await loadArchive(req.params.id);
    if (!archive) return res.status(404).json({ error: 'Archive not found.' });
    const keyKind = await matchRecoveryKey(archive, recoveryKey);
    if (!keyKind) return res.status(401).json({ error: 'Invalid recovery key. Please check the code and try again.' });

    clearRecoveryAttempts(req);
    const token = createSignedToken(archive.id, 'owner', 24 * 30);
    setOwnerCookie(res, token);
    const info = clientInfo(req);
    db.addAccessLog(archive.id, {
      action: 'recovery_key_unlock',
      actorRole: 'owner',
      summary: keyKind === 'master' ? 'Master Owner Recovery Key Authenticated' : 'Backup Owner Recovery Key Authenticated',
      ipHint: info.ipHint,
      deviceInfo: info.device
    });
    void db.persistArchive(archive.id).catch((error) => console.error('Failed to persist owner recovery activity:', error));
    return res.json({ success: true, token, keyKind });
  } catch (error) {
    next(error);
  }
});

// Universal key login: preserve the existing master-key lookup and add backup-key fallback.
ownerKeyRouter.post('/archives/auth/key-access', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!consumeRecoveryAttempt(req, res)) return;
    const { key, identifier } = req.body || {};
    if (!key || typeof key !== 'string' || key.length > 512 || (identifier !== undefined && typeof identifier !== 'string')) {
      return res.status(400).json({ error: 'Please enter your owner recovery key.' });
    }

    await db.ensureLoaded();
    const primary = await findArchiveAndVerifyKey(key, identifier);
    let archive = primary.success && primary.archive ? primary.archive as ArchiveWithBackupKey : undefined;
    let keyKind: RecoveryKeyKind | null = archive ? 'master' : null;
    let token = primary.success ? primary.token : undefined;

    if (!archive) {
      const cleanKey = normalizeRecoveryKeyInput(key);
      const candidates = Array.from(db.archives.values())
        .filter((candidate) => !candidate.deletedAt)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()) as ArchiveWithBackupKey[];

      for (const candidate of candidates) {
        if (!candidate.backupRecoveryKeyHash) continue;
        if (await bcrypt.compare(cleanKey, candidate.backupRecoveryKeyHash)) {
          archive = candidate;
          keyKind = 'backup';
          token = createSignedToken(candidate.id, 'owner', 24 * 30);
          break;
        }
      }
    }

    if (!archive || !token || !keyKind) {
      return res.status(401).json({ success: false, error: 'Invalid recovery key. Enter the complete owner recovery key from your saved file.' });
    }

    await db.ensureArchiveLoaded(archive.id);
    clearRecoveryAttempts(req);
    setOwnerCookie(res, token);
    const info = clientInfo(req);
    db.addAccessLog(archive.id, {
      action: 'recovery_key_unlock',
      actorRole: 'owner',
      summary: keyKind === 'master' ? 'Master Owner Recovery Key Login' : 'Backup Owner Recovery Key Login',
      ipHint: info.ipHint,
      deviceInfo: info.device
    });
    void db.persistArchive(archive.id).catch((error) => console.error('Failed to persist owner key login activity:', error));

    const current = db.findById(archive.id) as ArchiveWithBackupKey;
    return res.json({
      success: true,
      token,
      keyKind,
      workspaceSlug: current.workspaceSlug,
      slug: current.slug,
      archive: current
    });
  } catch (error) {
    next(error);
  }
});

// Owner-only creation/replacement of a secondary key. The master key hash is immutable.
ownerKeyRouter.post('/archives/:id/auth/recovery/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const archive = await loadArchive(req.params.id);
    if (!archive) return res.status(404).json({ error: 'Archive not found.' });
    if (!ownerSessionFor(req, archive.id)) {
      return res.status(403).json({ error: 'Only the archive owner can create or replace a backup owner key.' });
    }

    const hadBackup = Boolean(archive.backupRecoveryKeyHash);
    const previousBackupHash = archive.backupRecoveryKeyHash;
    const previousUpdatedAt = archive.updatedAt;
    const backupKey = generateBackupOwnerKey();
    archive.backupRecoveryKeyHash = bcrypt.hashSync(backupKey, 10);
    archive.updatedAt = new Date().toISOString();

    const info = clientInfo(req);
    db.addAccessLog(archive.id, {
      action: 'content_edit',
      actorRole: 'owner',
      summary: hadBackup ? 'Replaced Backup Owner Recovery Key' : 'Created Backup Owner Recovery Key',
      ipHint: info.ipHint,
      deviceInfo: info.device
    });

    try {
      await db.persistArchive(archive.id);
    } catch (error) {
      archive.backupRecoveryKeyHash = previousBackupHash;
      archive.updatedAt = previousUpdatedAt;
      return res.status(503).json({ error: 'The backup owner key could not be saved durably. The previous owner keys are unchanged.' });
    }

    return res.json({
      success: true,
      recoveryKey: backupKey,
      keyKind: 'backup',
      masterKeyStillValid: true,
      replacedPreviousBackup: hadBackup
    });
  } catch (error) {
    next(error);
  }
});
