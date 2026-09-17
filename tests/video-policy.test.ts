import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { archiveVideoCount, enforceArchiveVideoLimit } from '../server/videoPolicy';
import { db } from '../server/db';

function mockResponse() {
  const state: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; }
  } as unknown as Response;
  return { res, state };
}

describe('archive-wide video policy', () => {
  it('rejects a sixth combined Journey/Vault video while allowing non-video uploads', () => {
    const archiveId = `video-policy-${Date.now()}`;
    db.mediaItems.set(archiveId, [
      { id: 'v1', archiveId, type: 'video', url: 'one.mp4', caption: '', altText: '', tags: [], notes: [], position: 0, createdAt: new Date().toISOString() } as any,
      { id: 'v2', archiveId, type: 'video', url: 'two.mp4', caption: '', altText: '', tags: [], notes: [], position: 1, createdAt: new Date().toISOString() } as any
    ]);
    db.timelineEvents.set(archiveId, [
      { id: 't1', archiveId, title: 'A', description: 'A', yearLabel: '2025', mediaUrl: 'a.mp4', tags: [], position: 0, isDraft: false, createdAt: new Date().toISOString() } as any,
      { id: 't2', archiveId, title: 'B', description: 'B', yearLabel: '2025', mediaUrl: 'b.webm', tags: [], position: 1, isDraft: false, createdAt: new Date().toISOString() } as any,
      { id: 't3', archiveId, title: 'C', description: 'C', yearLabel: '2025', mediaUrl: 'c.mov', tags: [], position: 2, isDraft: false, createdAt: new Date().toISOString() } as any
    ]);

    expect(archiveVideoCount(archiveId)).toBe(5);

    const { res, state } = mockResponse();
    let nextCalled = false;
    const request = {
      method: 'POST',
      originalUrl: `/api/archives/${archiveId}/media/upload-url`,
      url: `/api/archives/${archiveId}/media/upload-url`,
      body: { purpose: 'vault', contentType: 'video/mp4' }
    } as Request;
    enforceArchiveVideoLimit(request, res, (() => { nextCalled = true; }) as NextFunction);

    expect(nextCalled).toBe(false);
    expect(state.status).toBe(413);
    expect(String((state.body as any).error)).toContain('maximum of 5 videos');

    const imageResponse = mockResponse();
    nextCalled = false;
    enforceArchiveVideoLimit({ ...request, body: { purpose: 'vault', contentType: 'image/jpeg' } } as Request, imageResponse.res, (() => { nextCalled = true; }) as NextFunction);
    expect(nextCalled).toBe(true);

    db.mediaItems.delete(archiveId);
    db.timelineEvents.delete(archiveId);
  });
});
