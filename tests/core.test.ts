import { describe, it, expect } from 'vitest';
import { sanitizeSlug, validateSlug, resolveTenant } from '../src/lib/tenant';
import { evaluatePin, generateRecoveryKey } from '../src/lib/security';
import { createSignedToken, verifySignedToken, findArchiveAndVerifyKey, verifyArchivePin, verifyViewerPin } from '../server/auth';
import { db } from '../server/db';

describe('Tenant & Slug Utilities', () => {
  it('sanitizes titles into valid web slugs', () => {
    expect(sanitizeSlug('Mary’s Convent High School - Class of 2025')).toBe('marys-convent-high-school-class-of-2025');
    expect(sanitizeSlug('Riverdale Institute of Technology  -- 2026')).toBe('riverdale-institute-of-technology-2026');
    expect(sanitizeSlug('   Batch of 2026! @ Campus #1   ')).toBe('batch-of-2026-campus-1');
  });

  it('validates slugs with strict security rules', () => {
    expect(validateSlug('valid-slug-2026').valid).toBe(true);
    expect(validateSlug('ab').valid).toBe(false); // too short (< 3)
    expect(validateSlug('-invalid-start').valid).toBe(false);
    expect(validateSlug('invalid-end-').valid).toBe(false);
    expect(validateSlug('admin').valid).toBe(false); // reserved
    expect(validateSlug('api').valid).toBe(false); // reserved
  });

  it('resolves tenant context correctly for public, workspace, and platform paths', () => {
    expect(resolveTenant('/').type).toBe('platform');
    expect(resolveTenant('/explore').type).toBe('platform');
    expect(resolveTenant('/workspace/ws-marys-convent').type).toBe('workspace_editor');
    expect(resolveTenant('/s/marys-convent-2025').type).toBe('public_archive');
    expect(resolveTenant('/s/marys-convent-2025').identifier).toBe('marys-convent-2025');
  });
});

describe('Security & Authentication', () => {
  it('evaluates PIN complexity and rejects weak/forbidden codes', () => {
    expect(evaluatePin('1234').isAllowed).toBe(false);
    expect(evaluatePin('000000').isAllowed).toBe(false);
    expect(evaluatePin('abcd').isAllowed).toBe(false);
    expect(evaluatePin('202525').isAllowed).toBe(true);
    expect(evaluatePin('839201').score).toBeGreaterThanOrEqual(2);
  });

  it('generates well-formatted 256-bit recovery keys', () => {
    const key = generateRecoveryKey();
    expect(key.startsWith('mc_rec_')).toBe(true);
    expect(key.length).toBeGreaterThanOrEqual(20);
  });

  it('signs and cryptographically verifies user session tokens', () => {
    const token = createSignedToken('test-archive-123', 'owner', 24);
    expect(typeof token).toBe('string');
    
    const verification = verifySignedToken(token);
    expect(verification.valid).toBe(true);
    expect(verification.archiveId).toBe('test-archive-123');
    expect(verification.role).toBe('owner');

    const fakeVerification = verifySignedToken('invalid:token:payload:fakehmac');
    expect(fakeVerification.valid).toBe(false);
  });

  it('uses recovery keys for owner access and never upgrades a PIN to owner', () => {
    const pinResult = findArchiveAndVerifyKey('202525', 'marys-convent-2025');
    expect(pinResult.success).toBe(false);

    const recoveryResult = findArchiveAndVerifyKey('mc_rec_sample_key_123');
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.token).toBeDefined();
    expect(verifySignedToken(recoveryResult.token!).role).toBe('owner');
  });

  it('keeps contributor and private-viewer sessions least-privileged', () => {
    const contributor = verifyArchivePin('demo-marys-2025', '202525', 'test-contributor');
    expect(contributor.success).toBe(true);
    expect(verifySignedToken(contributor.token!).role).toBe('contributor');

    const archive = db.archives.get('demo-marys-2025')!;
    const originalHash = archive.viewerPinHash;
    const originalVisibility = archive.visibility;
    archive.viewerPinHash = archive.editorPinHash;
    archive.visibility = 'private';
    try {
      const viewer = verifyViewerPin('demo-marys-2025', '202525', 'test-viewer');
      expect(viewer.success).toBe(true);
      expect(verifySignedToken(viewer.token!).role).toBe('viewer');
    } finally {
      archive.viewerPinHash = originalHash;
      archive.visibility = originalVisibility;
    }
  });
});

describe('Database Multi-Tenant Isolation', () => {
  it('lists public archives correctly', () => {
    const publicArchives = db.listPublicArchives();
    expect(publicArchives.length).toBeGreaterThanOrEqual(2);
    expect(publicArchives.some(a => a.id === 'demo-marys-2025')).toBe(true);
  });

  it('removes archives hidden from Explore without changing deployment status', () => {
    const archiveId = 'demo-marys-2025';
    const original = db.archives.get(archiveId)!;

    try {
      db.archives.set(archiveId, { ...original, isHiddenFromExplore: true });
      expect(db.listPublicArchives().some((archive) => archive.id === archiveId)).toBe(false);
      expect(db.archives.get(archiveId)?.deploymentStatus).toBe('deployed');
    } finally {
      db.archives.set(archiveId, original);
    }
  });

  it('maintains separated data stores per archive ID', () => {
    const marysMembers = db.getMembers('demo-marys-2025');
    const riverdaleMembers = db.getMembers('demo-riverdale-2026');
    
    expect(marysMembers.length).toBeGreaterThan(0);
    expect(riverdaleMembers.length).toBeGreaterThan(0);
    expect(marysMembers.some(m => m.name === 'Ananya Deshmukh')).toBe(true);
    expect(riverdaleMembers.some(m => m.name === 'Arjun Nambiar')).toBe(true);
  });

  it('persists timeline layout choices without changing archive content', () => {
    const archiveId = 'demo-marys-2025';
    const originalSections = db.getSections(archiveId).map((section) => ({ ...section }));
    const updatedSections = originalSections.map((section) =>
      section.stableType === 'timeline' ? { ...section, layout: 'stacked-cards' } : section
    );

    try {
      db.setSections(archiveId, updatedSections, 'owner');
      const savedTimeline = db.getSections(archiveId).find((section) => section.stableType === 'timeline');
      expect(savedTimeline?.layout).toBe('stacked-cards');
    } finally {
      db.setSections(archiveId, originalSections, 'owner');
    }
  });

  it('records privacy-safe share activity without changing archive content', () => {
    const archiveId = 'demo-marys-2025';
    const before = db.findById(archiveId);
    const event = db.addShareActivity(archiveId, 'instagram_story', 'opened');
    expect(event.archiveId).toBe(archiveId);
    expect(event.channel).toBe('instagram_story');
    expect(db.getShareActivity(archiveId, 1)[0]?.id).toBe(event.id);
    expect(db.findById(archiveId)).toEqual(before);
  });
});
