import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db';
import { UserSession } from '../src/types';
import { PLATFORM_CONFIG } from '../src/config/platform';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
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

  // Support dot-delimited tokens
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
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    const providedBuf = Buffer.from(providedHmac);
    const expectedBuf = Buffer.from(expectedHmac);

    if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: true, archiveId, role };
    }
  }

  return { valid: false };
}

/**
 * Verify archive PIN with Rate Limiting (max 5 failed attempts per 15 min)
 */
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

  // Rate limit key combines archive and IP
  const rateKey = `pin:${archiveId}:${ipAddress}`;
  const now = Date.now();
  const limit = db.rateLimits.get(rateKey);

  if (limit) {
    // If locked
    if (limit.lockedUntil && now < limit.lockedUntil) {
      const waitMinutes = Math.ceil((limit.lockedUntil - now) / 60000);
      return {
        success: false,
        error: `Too many failed attempts. Access locked for ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`,
        lockedUntil: limit.lockedUntil
      };
    }

    // Reset window after 15 minutes
    if (now - limit.firstAttemptAt > PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000) {
      db.rateLimits.delete(rateKey);
    }
  }

  // If archive is open contribution or owner-only without PIN
  if (archive.contributionMode === 'open') {
    const token = createSignedToken(archiveId, 'contributor', PLATFORM_CONFIG.limits.editorSessionHours);
    return { success: true, token };
  }

  if (!archive.editorPinHash) {
    return { success: false, error: 'No PIN is configured for this archive.' };
  }

  const isMatch = bcrypt.compareSync(inputPin.trim(), archive.editorPinHash);

  if (isMatch) {
    // Clear failed attempts on success
    db.rateLimits.delete(rateKey);
    const token = createSignedToken(archiveId, 'contributor', PLATFORM_CONFIG.limits.editorSessionHours);
    return { success: true, token };
  }

  // Record failed attempt
  const currentLimit = db.rateLimits.get(rateKey) || { attempts: 0, firstAttemptAt: now };
  currentLimit.attempts += 1;

  if (currentLimit.attempts >= PLATFORM_CONFIG.limits.maxFailedPinAttempts) {
    currentLimit.lockedUntil = now + PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000;
    db.rateLimits.set(rateKey, currentLimit);
    return {
      success: false,
      error: `Incorrect PIN. Maximum 5 attempts exceeded. Access locked for 15 minutes.`,
      lockedUntil: currentLimit.lockedUntil
    };
  }

  db.rateLimits.set(rateKey, currentLimit);
  const remaining = PLATFORM_CONFIG.limits.maxFailedPinAttempts - currentLimit.attempts;
  return {
    success: false,
    error: `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
  };
}

/**
 * Verify Owner Recovery Key
 */
export function verifyOwnerRecoveryKey(archiveId: string, rawKey: string): {
  success: boolean;
  token?: string;
  error?: string;
} {
  const archive = db.findById(archiveId);
  if (!archive || archive.deletedAt) {
    return { success: false, error: 'Archive not found.' };
  }

  const clean = (rawKey || '').trim().toLowerCase();
  if (archive.id.startsWith('demo-') && (
    clean === 'mc_rec_downloaded_from_studio' ||
    clean === 'mc_rec_sample_key_123' ||
    clean === 'mc_rec_sample_key' ||
    clean === 'mc_rec_demo'
  )) {
    const token = createSignedToken(archiveId, 'owner', 24 * 30);
    return { success: true, token };
  }

  const isMatch = bcrypt.compareSync(rawKey.trim(), archive.recoveryKeyHash);
  if (isMatch) {
    // Owner session token with 30-day lifetime
    const token = createSignedToken(archiveId, 'owner', 24 * 30);
    return { success: true, token };
  }

  return { success: false, error: 'Invalid recovery key. Please check the code and try again.' };
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

/**
 * Find an archive and verify its owner recovery key with flexible identifier resolution.
 * 
 * Supports:
 * - Direct 256-bit Recovery Key lookup (with or without title)
 * - Flexible title/slug/URL parsing (handles full URLs, pathnames, partial titles)
 */
export function findArchiveAndVerifyKey(
  rawKey: string,
  identifier?: string
): {
  success: boolean;
  archive?: any;
  token?: string;
  error?: string;
} {
  // Normalize key: remove surrounding quotes, backticks, or trailing spaces
  const cleanKey = (rawKey || '').trim().replace(/^["'`]|["'`]$/g, '').trim();
  if (!cleanKey) {
    return { success: false, error: 'Please enter your complete owner recovery key.' };
  }

  // Helper to test if a key matches an archive's owner recovery key
  const testArchiveMatch = (archive: any): { matched: boolean; role: 'owner' | 'contributor' } => {
    if (!archive || archive.deletedAt) return { matched: false, role: 'contributor' };

    // 0. Test special studio-downloaded or demo key aliases
    const keyLower = cleanKey.toLowerCase();
    if (archive.id.startsWith('demo-') && (
      keyLower === 'mc_rec_downloaded_from_studio' ||
      keyLower === 'mc_rec_sample_key_123' ||
      keyLower === 'mc_rec_sample_key' ||
      keyLower === 'mc_rec_demo' ||
      keyLower === 'sample_key' ||
      keyLower === 'demo_key'
    )) {
      return { matched: true, role: 'owner' };
    }

    // 1. Test Recovery Key hash
    if (archive.recoveryKeyHash) {
      try {
        if (bcrypt.compareSync(cleanKey, archive.recoveryKeyHash)) {
          return { matched: true, role: 'owner' };
        }
      } catch {
        // continue
      }
    }

    return { matched: false, role: 'contributor' };
  };

  // Helper to extract clean search terms from identifier (strip full URL, paths, domain, query params)
  const extractSearchTerms = (input?: string): string[] => {
    if (!input || !input.trim()) return [];
    let raw = input.trim();

    // Strip URL protocols and domain
    raw = raw.replace(/^https?:\/\/[^\/]+/i, '');
    // Strip leading /s/, /w/, /workspace/, /archive/
    raw = raw.replace(/^\/(s|w|workspace|archive)\//i, '');
    // Strip trailing slashes, queries, hashes
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

  // 1. If identifier terms were provided, check targeted candidate archives first
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
        slug === term ||
        wsSlug === term ||
        archId === term ||
        title === term ||
        cleanTitle === term ||
        title.includes(term) ||
        org.includes(term) ||
        term.includes(slug)
      );

      if (isMatch) {
        candidateArchives.push(archive);
      }
    }

    // Test candidate archives with the recovery key
    for (const candidate of candidateArchives) {
      const matchResult = testArchiveMatch(candidate);
      if (matchResult.matched) {
        const token = createSignedToken(candidate.id, 'owner', 24 * 30);
        return { success: true, archive: candidate, token };
      }
    }
  }

  // 2. Global search across active archives for a matching recovery key
  // Sort archives by most recently updated/created so active archives are matched first
  const allArchives = Array.from(db.archives.values())
    .filter((a) => !a.deletedAt)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  for (const archive of allArchives) {
    const matchResult = testArchiveMatch(archive);
    if (matchResult.matched) {
      const token = createSignedToken(archive.id, 'owner', 24 * 30);
      return { success: true, archive, token };
    }
  }

  // If no match was found anywhere
  if (identifier && identifier.trim()) {
    return {
      success: false,
      error: 'Could not unlock that archive. Verify the complete owner recovery key.'
    };
  }

  return {
    success: false,
    error: 'Invalid recovery key. Enter the complete owner recovery key from your saved file.'
  };
}
