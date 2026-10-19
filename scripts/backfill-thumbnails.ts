/**
 * Thumbnail backfill (Phase 1 follow-up). DRY RUN BY DEFAULT.
 *
 * Gives OLD image uploads the small grid thumbnail that new uploads get:
 * for every image media item without a real thumbnail, download the original
 * once, make a ~480px WebP copy, upload it next to the original, and set ONLY
 * thumbnailUrl/thumbnailStorageKey on that DB row. Nothing is deleted, moved
 * or re-encoded; originals stay untouched. Every change is logged to a JSONL
 * audit file, and --undo restores the previous thumbnail fields from it.
 *
 * Run (after `npm i -D sharp`):
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... OBJECT_STORAGE_* =... \
 *   npx tsx scripts/backfill-thumbnails.ts --archive <archiveId> --dry-run
 *   (then without --dry-run for the real pass; --all for every archive)
 *
 * Safety rules baked in:
 *  - dry-run unless --no-dry-run is passed explicitly
 *  - never runs before the B2 daily reset unless --i-know-reset-passed is given
 *    (reset is 00:00 UTC = 5:30 AM IST)
 *  - one archive at a time, throttled, audit log for exact undo
 */
import { createWriteStream, mkdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../server/db';
import { createDownloadUrl, createUploadUrl, publicObjectUrl, verifyObject } from '../server/r2';
import type { MediaItem } from '../src/types';

type AuditEntry = {
  archiveId: string;
  mediaId: string;
  storageKey: string;
  thumbnailStorageKey: string;
  previousThumbnailUrl?: string;
  previousThumbnailStorageKey?: string;
  bytesOriginal?: number;
  bytesThumb?: number;
  at: string;
};

function parseArgs(argv: string[]) {
  const arg = (name: string) => {
    const hit = argv.find((a) => a === name || a.startsWith(`${name}=`));
    return hit?.includes('=') ? hit.split('=')[1] : hit ? 'true' : undefined;
  };
  return {
    archive: arg('--archive'),
    all: Boolean(arg('--all')),
    dryRun: !arg('--no-dry-run'),
    undo: arg('--undo'),
    limit: Number(arg('--limit') || '0') || 0,
    delayMs: Number(arg('--delay-ms') || '1500'),
    auditFile: arg('--audit-file') || `backfill-audit-${Date.now()}.jsonl`,
    resetOk: Boolean(arg('--i-know-reset-passed'))
  };
}

/** Images that still use the full file (or nothing) as their grid thumbnail. */
export function needsThumbnail(item: MediaItem): boolean {
  if (item.type !== 'image') return false;
  if (!item.storageKey) return false; // external-URL items: leave alone
  return !item.thumbnailStorageKey || item.thumbnailStorageKey === item.storageKey;
}

export function thumbnailKeyFor(archiveId: string, now: number = Date.now(), uuid: string = crypto.randomUUID()): string {
  return `archives/${archiveId}/${now}-${uuid}.webp`;
}

async function makeThumbnail(original: Buffer): Promise<Buffer> {
  // sharp is a script-only devDependency: npm i -D sharp
  // @ts-ignore -- script-only devDependency, installed at run time (npm i -D sharp)
  const sharp = (await import('sharp')).default;
  return sharp(original)
    .rotate() // honor EXIF orientation
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function undoFromAudit(file: string) {
  const { createReadStream } = await import('node:fs');
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let reverted = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as AuditEntry;
    const item = db.getMediaItems(e.archiveId).find((m) => m.id === e.mediaId);
    if (!item) { console.error(`undo: media ${e.mediaId} not found in ${e.archiveId}, skipped`); continue; }
    // Only revert if the row still points at the thumbnail this run created.
    if (item.thumbnailStorageKey !== e.thumbnailStorageKey) { console.error(`undo: ${e.mediaId} changed since, skipped`); continue; }
    db.updateMediaItem(e.archiveId, e.mediaId, {
      thumbnailUrl: e.previousThumbnailUrl,
      thumbnailStorageKey: e.previousThumbnailStorageKey
    });
    await db.persistArchive(e.archiveId);
    reverted++;
  }
  console.log(`undo: reverted ${reverted} media rows (thumbnail objects left in storage, harmless)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.undo) {
    await db.ensureLoaded();
    await undoFromAudit(args.undo);
    return;
  }
  if (!args.archive && !args.all) {
    console.error('Pass --archive <id> (recommended first) or --all.');
    process.exit(1);
  }
  if (!args.dryRun && !args.resetOk) {
    const utcHour = new Date().getUTCHours();
    if (utcHour < 1) { // 00:00-00:59 UTC: reset may not have fully settled
      console.error('B2 reset (00:00 UTC / 5:30 AM IST) has not safely passed. Re-run later or pass --i-know-reset-passed.');
      process.exit(1);
    }
  }
  if (args.all) {
    console.error('--all is intentionally disabled: run per archive with --archive <id> so each archive is verified before the next. Archive ids are listed in the owner dashboard.');
    process.exit(1);
  }
  await db.ensureLoaded();
  const archiveIds = [args.archive!];

  mkdirSync(path.dirname(path.resolve(args.auditFile)), { recursive: true });
  let processed = 0, failed = 0;
  for (const archiveId of archiveIds) {
    const archive = db.findById(archiveId);
    if (!archive) { console.error(`archive ${archiveId} not found`); failed++; continue; }
    const items = db.getMediaItems(archiveId).filter(needsThumbnail);
    console.log(`${archiveId} "${archive.title}": ${items.length} images need thumbnails`);
    for (const item of items) {
      if (args.limit && processed >= args.limit) break;
      const key = item.storageKey!;
      try {
        const url = await createDownloadUrl(key);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const original = Buffer.from(await res.arrayBuffer());
        if (args.dryRun) {
          console.log(`[dry-run] ${item.id}: would thumb ${key} (${original.length} B)`);
          processed++;
          continue;
        }
        const thumb = await makeThumbnail(original);
        const thumbKey = thumbnailKeyFor(archiveId);
        const uploadUrl = await createUploadUrl(thumbKey, 'image/webp', thumb.length);
        const put = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(thumb), headers: { 'Content-Type': 'image/webp' } });
        if (!put.ok) throw new Error(`upload ${put.status}`);
        await verifyObject(thumbKey, 'image/webp', thumb.length);
        const entry: AuditEntry = {
          archiveId, mediaId: item.id, storageKey: key, thumbnailStorageKey: thumbKey,
          previousThumbnailUrl: item.thumbnailUrl, previousThumbnailStorageKey: item.thumbnailStorageKey,
          bytesOriginal: original.length, bytesThumb: thumb.length, at: new Date().toISOString()
        };
        db.updateMediaItem(archiveId, item.id, {
          thumbnailUrl: publicObjectUrl(thumbKey),
          thumbnailStorageKey: thumbKey
        });
        await db.persistArchive(archiveId);
        await appendFile(args.auditFile, JSON.stringify(entry) + '\n');
        processed++;
        console.log(`${item.id}: ${original.length} -> ${thumb.length} B`);
        await sleep(args.delayMs);
      } catch (err) {
        failed++;
        console.error(`${item.id} (${key}) failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  console.log(`done: ${processed} processed, ${failed} failed${args.dryRun ? ' (dry run, nothing changed)' : ''}`);
  if (!args.dryRun) console.log(`audit: ${args.auditFile}`);
}

const isEntryPoint = (() => {
  try { return import.meta.url === new URL(`file://${process.argv[1]}`).href; } catch { return false; }
})();
if (isEntryPoint) main().catch((err) => { console.error(err); process.exit(1); });
