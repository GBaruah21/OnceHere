import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.js';
import { UserSession } from '../src/types/index.js';
import { PLATFORM_CONFIG } from '../src/config/platform.js';
import { getSessionSecret } from './runtime-config.js';

let developmentSessionSecret: string | undefined;

// Resolve lazily so the health endpoint can report a missing deployment secret
// instead of the entire serverless function crashing during module import.
function sessionSecret(): string {
  const configured = getSessionSecret();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production requires SESSION_SECRET so owner sessions survive restarts.');
  }
  developmentSessionSecret ||= crypto.randomBytes(32).toString('hex');
  return developmentSessionSecret;
}

/** Accept a copied key or the complete downloaded recovery-key receipt. */
export function normalizeRecoveryKeyInput(value: string): string {
  const trimmed = (value || '').trim().replace(/^["'`]|["'`]$/g, '').trim();
  return trimmed.match(/mc_(?:rec|backup)_[a-z0-9_-]+/i)?.[0] || trimmed;
}

export interface AuthContext {
  archiveId: string;
  role: 'owner' | 'contributor' | 'viewer' | 'none';
  session?: UserSession;
}

/**
 * Creates a signed, independently revocable token with a random nonce.
 */
export function createSignedToken(archiveId: string, role: 'owner' | 'contributor' | 'viewer', durationHours: number): string {
  const expiresAtMs = Date.now() + durationHours * 60 * 60 * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const payload = `${archiveId}.${role}.${expiresAtMs}.${crypto.randomBytes(16).toString('hex')}`;
  const hmac = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  const token = `${payload}.${hmac}`;

  const session: UserSession = {
    archiveId,
    role,
    token,
    expiresAt
  };
  db.sessions.set(token, session);
  return token;
}

/**
 * Validates a signed session token
 */
export function verifySignedToken(token: string): { valid: boolean; archiveId?: string; role?: 'owner' | 'contributor' | 'viewer' } {
  if (!token) return { valid: false };
  const session = db.sessions.get(token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return { valid: false };
  if (db.archives.get(session.archiveId)?.deletedAt) return { valid: false };

  const parts = token.split('.');
  if (parts.length === 4 || parts.length === 5) {
    const [archiveId, role, expiresAtMsStr] = parts;
    const providedHmac = parts[parts.length - 1];
    if (role !== 'owner' && role !== 'contributor' && role !== 'viewer') return { valid: false };

    const expiresAtMs = parseInt(expiresAtMsStr, 10);
    if (isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      db.sessions.delete(token);
      return { valid: false };
    }

    if (session.archiveId !== archiveId || session.role !== role) return { valid: false };
    const payload = parts.slice(0, -1).join('.');
    const expectedHmac = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
    const providedBuf = Buffer.from(providedHmac);
    const expectedBuf = Buffer.from(expectedHmac);

    if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: true, archiveId, role };
    }
  }

  return { valid: false };
}

export function verifyArchivePin(archiveId: string, inputPin: string, ipAddress: string = 'client'): {
  success: boolean;
  token?: string;
  error?: string;
  lockedUntil?: number;
} {
  const archive = db.findById(archiveId);
  if (!archive || archive.deletedAt || archive.contributionMode === 'owner-only') {
    return { success: false, error: 'Archive not found.' };
  }

  const rateKey = `pin:${archiveId}:${ipAddress}`;
  const now = Date.now();
  const limit = db.rateLimits.get(rateKey);

  if (limit) {
    if (limit.lockedUntil && now < limit.lockedUntil) {
      const waitMinutes = Math.ceil((limit.lockedUntil - now) / 60000);
      return {
        success: false,
        error: `Too many failed attempts. Access locked for ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`,
        lockedUntil: limit.lockedUntil
      };
    }
    if (now - limit.firstAttemptAt > PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000) {
      db.rateLimits.delete(rateKey);
    }
  }

  if (archive.contributionMode === 'open') {
    const token = createSignedToken(archiveId, 'contributor', PLATFORM_CONFIG.limits.editorSessionHours);
    return { success: true, token };
  }

  if (!archive.editorPinHash) {
    return { success: false, error: 'No PIN is configured for this archive.' };
  }

  const isMatch = bcrypt.compareSync(inputPin.trim(), archive.editorPinHash);
  if (isMatch) {
    db.rateLimits.delete(rateKey);
    const token = createSignedToken(archiveId, 'contributor', PLATFORM_CONFIG.limits.editorSessionHours);
    return { success: true, token };
  }

  const currentLimit = db.rateLimits.get(rateKey) || { attempts: 0, firstAttemptAt: now };
  currentLimit.attempts += 1;
  if (currentLimit.attempts >= PLATFORM_CONFIG.limits.maxFailedPinAttempts) {
    currentLimit.lockedUntil = now + PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000;
    db.rateLimits.set(rateKey, currentLimit);
    return {
      success: false,
      error: 'The PIN could not be verified. Please wait and try again later.',
      lockedUntil: currentLimit.lockedUntil
    };
  }
  db.rateLimits.set(rateKey, currentLimit);
  return { success: false, error: 'The PIN could not be verified. Please check it and try again.' };
}

function ownerKeyMatches(archive: { recoveryKeyHash: string; backupRecoveryKeyHash?: string }, key: string): boolean {
  try {
    if (archive.recoveryKeyHash && bcrypt.compareSync(key, archive.recoveryKeyHash)) return true;
    return Boolean(archive.backupRecoveryKeyHash && bcrypt.compareSync(key, archive.backupRecoveryKeyHash));
  } catch {
    return false;
  }
}

/** Verify the permanent master key or the optional revocable backup owner key. */
export function verifyOwnerRecoveryKey(archiveId: string, rawKey: string): {
  success: boolean;
  token?: string;
  error?: string;
} {
  const archive = db.findById(archiveId);
  if (!archive || archive.deletedAt) return { success: false, error: 'Archive not found.' };

  const normalizedKey = normalizeRecoveryKeyInput(rawKey);
  const clean = normalizedKey.toLowerCase();
  if (archive.id.startsWith('demo-') && (
    clean === 'mc_rec_downloaded_from_studio' ||
    clean === 'mc_rec_sample_key_123' ||
    clean === 'mc_rec_sample_key' ||
    clean === 'mc_rec_demo'
  )) {
    return { success: true, token: createSignedToken(archiveId, 'owner', 24 * 30) };
  }

  if (ownerKeyMatches(archive, normalizedKey)) {
    return { success: true, token: createSignedToken(archiveId, 'owner', 24 * 30) };
  }
  return { success: false, error: 'Invalid owner key. Check the complete saved key and try again.' };
}

/** Verify the separate private-viewer PIN without granting editing rights. */
export function verifyViewerPin(archiveId: string, inputPin: string, ipAddress: string = 'client'): {
  success: boolean;
  token?: string;
  error?: string;
  lockedUntil?: number;
} {
  const archive = db.findById(archiveId);
  if (!archive || archive.deletedAt) return { success: false, error: 'Archive not found.' };
  if (archive.visibility !== 'private' || !archive.viewerPinHash) {
    return { success: false, error: 'A private viewer PIN has not been configured.' };
  }

  const rateKey = `viewer-pin:${archiveId}:${ipAddress}`;
  const now = Date.now();
  const limit = db.rateLimits.get(rateKey);
  if (limit?.lockedUntil && now < limit.lockedUntil) {
    return { success: false, error: 'Too many failed attempts. Try again later.', lockedUntil: limit.lockedUntil };
  }
  if (limit && now - limit.firstAttemptAt > PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000) {
    db.rateLimits.delete(rateKey);
  }

  if (bcrypt.compareSync(inputPin.trim(), archive.viewerPinHash)) {
    db.rateLimits.delete(rateKey);
    return { success: true, token: createSignedToken(archiveId, 'viewer', 24) };
  }

  const current = db.rateLimits.get(rateKey) || { attempts: 0, firstAttemptAt: now };
  current.attempts += 1;
  if (current.attempts >= PLATFORM_CONFIG.limits.maxFailedPinAttempts) {
    current.lockedUntil = now + PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000;
  }
  db.rateLimits.set(rateKey, current);
  return { success: false, error: 'The PIN is incorrect. Please check it and try again.', lockedUntil: current.lockedUntil };
}

export async function findArchiveAndVerifyKey(
  rawKey: string,
  identifier?: string
): Promise<{ success: boolean; archive?: any; token?: string; error?: string }> {
  const cleanKey = normalizeRecoveryKeyInput(rawKey);
  if (!cleanKey) return { success: false, error: 'Please enter your complete owner key.' };

  const checked = new Set<string>();
  const testArchiveMatch = async (archive: any): Promise<boolean> => {
    if (!archive || archive.deletedAt || checked.has(archive.id)) return false;
    checked.add(archive.id);
    const keyLower = cleanKey.toLowerCase();
    if (archive.id.startsWith('demo-') && (
      keyLower === 'mc_rec_downloaded_from_studio' || keyLower === 'mc_rec_sample_key_123' ||
      keyLower === 'mc_rec_sample_key' || keyLower === 'mc_rec_demo' || keyLower === 'sample_key' || keyLower === 'demo_key'
    )) return true;
    return ownerKeyMatches(archive, cleanKey);
  };

  const extractSearchTerms = (input?: string): string[] => {
    if (!input || !input.trim()) return [];
    let raw = input.trim().replace(/^https?:\/\/[^\/]+/i, '');
    raw = raw.replace(/^\/(s|w|workspace|archive)\//i, '');
    raw = raw.split('?')[0].split('#')[0].replace(/\/+$/, '').trim();
    const terms = new Set<string>();
    if (raw) {
      terms.add(raw.toLowerCase());
      terms.add(raw.toLowerCase().replace(/[^a-z0-9]/g, ''));
      terms.add(raw.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
    }
    return Array.from(terms).filter(Boolean);
  };

  const candidateTerms = extractSearchTerms(identifier);
  if (candidateTerms.length > 0) {
    const candidateArchives: any[] = [];
    for (const archive of db.archives.values()) {
      if (archive.deletedAt) continue;
      const slug = (archive.slug || '').toLowerCase();
      const wsSlug = (archive.workspaceSlug || '').toLowerCase();
      const archId = (archive.id || '').toLowerCase();
      const title = (archive.title || '').toLowerCase();
      const org = (archive.organizationName || '').toLowerCase();
      const cleanTitle = title.replace(/[^a-z0-9]/g, '');
      const isMatch = candidateTerms.some((term) =>
        slug === term || wsSlug === term || archId === term || title === term || cleanTitle === term ||
        title.includes(term) || org.includes(term) || (Boolean(slug) && term.includes(slug))
      );
      if (isMatch) candidateArchives.push(archive);
    }
    for (const candidate of candidateArchives) {
      if (await testArchiveMatch(candidate)) {
        return { success: true, archive: candidate, token: createSignedToken(candidate.id, 'owner', 24 * 30) };
      }
    }
  }

  const allArchives = Array.from(db.archives.values())
    .filter((a) => !a.deletedAt)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  for (const archive of allArchives) {
    if (await testArchiveMatch(archive)) {
      return { success: true, archive, token: createSignedToken(archive.id, 'owner', 24 * 30) };
    }
  }

  return {
    success: false,
    error: identifier?.trim()
      ? 'Could not unlock that archive. Verify the complete owner key.'
      : 'Invalid owner key. Enter the complete key from your saved file.'
  };
}
