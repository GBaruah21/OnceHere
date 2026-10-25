/**
 * Attempt-counter semantics (in-memory mode; the CAS loop shares the same
 * mutate functions in durable mode): expired windows reset without erasing
 * fresh increments, and a verified-credential clear never erases a live lockout.
 */
import { describe, expect, it } from 'vitest';
import { db } from '../server/db';
import { PLATFORM_CONFIG } from '../src/config/platform';

const windowMs = PLATFORM_CONFIG.limits.pinLockoutMinutes * 60 * 1000;
const increment = (entry: { attempts: number; firstAttemptAt: number; lockedUntil?: number } | undefined) => {
  const now = Date.now();
  const base = !entry || now - entry.firstAttemptAt > windowMs ? { attempts: 0, firstAttemptAt: now } : { ...entry };
  base.attempts += 1;
  if (base.attempts >= PLATFORM_CONFIG.limits.maxFailedPinAttempts) base.lockedUntil = now + windowMs;
  return base;
};
// Same predicate the auth clear paths use.
const conditionalClear = (entry: { attempts: number; firstAttemptAt: number; lockedUntil?: number } | undefined) =>
  entry?.lockedUntil && Date.now() < entry.lockedUntil ? entry : null;

describe('attempt counter semantics', () => {
  it('resets an expired window instead of stacking onto it', async () => {
    const key = `pin:test-expired-${Date.now()}`;
    db.rateLimits.set(key, { attempts: 4, firstAttemptAt: Date.now() - windowMs - 1000 });
    const next = await db.mutateRateLimit(key, increment);
    expect(next?.attempts).toBe(1);
    expect(next?.lockedUntil).toBeUndefined();
  });

  it('stacks fresh increments within a live window', async () => {
    const key = `pin:test-fresh-${Date.now()}`;
    await db.mutateRateLimit(key, increment);
    await db.mutateRateLimit(key, increment);
    const third = await db.mutateRateLimit(key, increment);
    expect(third?.attempts).toBe(3);
    expect(third?.lockedUntil).toBeUndefined();
  });

  it('locks at the configured threshold', async () => {
    const key = `pin:test-lock-${Date.now()}`;
    let last;
    for (let i = 0; i < PLATFORM_CONFIG.limits.maxFailedPinAttempts; i += 1) last = await db.mutateRateLimit(key, increment);
    expect(last?.attempts).toBe(PLATFORM_CONFIG.limits.maxFailedPinAttempts);
    expect(typeof last?.lockedUntil).toBe('number');
  });

  it('conditional clear removes an unlocked counter but never a live lockout', async () => {
    const unlockedKey = `pin:test-clear-ok-${Date.now()}`;
    db.rateLimits.set(unlockedKey, { attempts: 3, firstAttemptAt: Date.now() });
    expect(await db.mutateRateLimit(unlockedKey, conditionalClear)).toBeNull();
    expect(db.rateLimits.has(unlockedKey)).toBe(false);

    const lockedKey = `pin:test-clear-locked-${Date.now()}`;
    const lockedUntil = Date.now() + 60000;
    db.rateLimits.set(lockedKey, { attempts: 5, firstAttemptAt: Date.now(), lockedUntil });
    const kept = await db.mutateRateLimit(lockedKey, conditionalClear);
    expect(kept?.lockedUntil).toBe(lockedUntil);
    expect(kept?.attempts).toBe(5);
  });
});
