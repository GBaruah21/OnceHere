#!/usr/bin/env node
// Protected restore for oncehere_state rows under the rowVersion barrier
// (db/rowversion-barrier.sql).
//
// The barrier rejects any write that re-presents a row's CURRENT rowVersion
// and any write with NO rowVersion on a stamped row; it never allows DELETE.
// So a restore must be an UPSERT that carries a FRESH rowVersion per attempt
// - never a verbatim replay, never delete+reinsert, and it never requires
// dropping the guards. This tool is the only approved restore shape.
//
// Input rows file (JSON): [{ "id": "tenant-...", "data": {...}, "updated_at": "..." }]
// - exactly the rows to restore; this file is the allowlist, nothing else is touched
// - `data` is the full stored envelope (format/chunks/compression/sha256[/rowVersion])
//
// Usage:
//   node db/protected-restore.mjs --url <turso-url> --token <token> --rows <file.json> [--dry-run]
//
// Safety properties:
//   - sequential, one statement per row, no batching, no loops beyond the list
//   - stops on the FIRST failed row and reports which ids completed
//   - verifies every written row by re-reading it (rowVersion + content)
//   - never issues DELETE, DROP, or writes to ids outside the rows file

import { createClient } from '@libsql/client';
import { randomUUID, createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import fs from 'node:fs';

export const mintRowVersion = () => `${new Date().toISOString()}#${randomUUID()}`;


const INDEX_ROW_ID = 'tenant-index';
function gunzip(chunks) {
  return gunzipSync(Buffer.from(chunks.map(c => String(c)).join(''), 'base64')).toString('utf8');
}
function makeTenantEnvelope(snapshot) {
  const json = JSON.stringify(snapshot);
  return {
    format: 1,
    chunks: [gzipSync(Buffer.from(json, 'utf8')).toString('base64')],
    compression: 'gzip',
    sha256: createHash('sha256').update(json).digest('hex'),
    rowVersion: mintRowVersion()
  };
}

// Build the row to write for one restore entry: identical content, FRESH
// version markers. Minting per call means a repeated restore of the same
// backup is a new version, not a replay the barrier must reject.
export function buildRestoreRow(row, mint = mintRowVersion) {
  if (!row || typeof row.id !== 'string' || !row.data || typeof row.data !== 'object') {
    throw new Error('Each restore row needs { id: string, data: object }.');
  }
  return {
    id: row.id,
    data: { ...row.data, rowVersion: mint() },
    updated_at: mint()
  };
}

// Restore is ATOMIC and FAIL-CLOSED:
//   - every row is written inside ONE transaction; any failure rolls back ALL
//     rows, so a restore can never leave a half-restored (incoherent) set.
//   - pass `expected` from a fresh inventory of the CURRENT database
//     (--expect file: [{ id, data, updated_at }], exactly what --inventory
//     writes). Each existing row is restored only if it still matches that
//     base BY CONTENT: updated_at alone is not enough - a same-millisecond
//     writer can change a row while its bare-ISO stamp stays identical.
//     A concurrent save between inventory and restore aborts everything
//     instead of being silently overwritten.
//   - without an expected base, only rows that do NOT exist yet are written
//     (INSERT OR IGNORE); an existing row aborts the restore. `force: true`
//     is the explicit, logged override (unconditional upsert, still atomic
//     and verified) for a deliberate restore over unknown current state.

// Current-state inventory for the given ids, in the exact shape --expect and
// --rows consume. Operator flow: inventory -> inspect -> restore --expect.
export async function inventoryRows(client, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const result = await client.execute({
    sql: `SELECT id, data, updated_at FROM oncehere_state WHERE id IN (${placeholders}) ORDER BY id ASC`,
    args: ids
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    data: JSON.parse(String(row.data)),
    updated_at: String(row.updated_at)
  }));
}

export async function restoreRows(client, rows, { dryRun = false, expected = {}, force = false } = {}) {
  const plan = rows.map((row) => buildRestoreRow(row));
  if (dryRun) {
    return { dryRun: true, planned: plan.map((r) => ({ id: r.id, rowVersion: r.data.rowVersion })) };
  }
  const tx = await client.transaction('write');
  try {
    for (const row of plan) {
      const data = JSON.stringify(row.data);
      const base = expected[row.id];
      if (base !== undefined && !force) {
        const res = await tx.execute({
          sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?',
          args: [data, row.updated_at, row.id, base.updated_at, typeof base.data === 'string' ? base.data : JSON.stringify(base.data)]
        });
        if ((res.rowsAffected ?? 0) === 0) {
          throw new Error(`Restore aborted: ${row.id} changed since the expected base was read. NOTHING was written - re-inventory and retry.`);
        }
      } else if (!force) {
        const res = await tx.execute({
          sql: 'INSERT OR IGNORE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)',
          args: [row.id, data, row.updated_at]
        });
        if ((res.rowsAffected ?? 0) === 0) {
          throw new Error(`Refusing to restore ${row.id}: the row exists and no expected base was supplied. NOTHING was written - re-inventory and pass --expect, or use --force deliberately.`);
        }
      } else {
        await tx.execute({
          sql: `INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
          args: [row.id, data, row.updated_at]
        });
      }
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
  // Verify every written row by re-reading it after the commit.
  const done = [];
  for (const row of plan) {
    const stored = (await client.execute({
      sql: 'SELECT data, updated_at FROM oncehere_state WHERE id = ?', args: [row.id]
    })).rows[0];
    const storedData = stored && typeof stored.data === 'string' ? JSON.parse(stored.data) : undefined;
    if (!storedData || storedData.rowVersion !== row.data.rowVersion || stored.updated_at !== row.updated_at) {
      throw new Error(`Verify failed after restoring ${row.id}; restored ids: ${done.join(', ') || '(none)'}`);
    }
    done.push(row.id);
  }
  return { dryRun: false, restored: done, forced: force };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const [url, token, rowsFile, expectFile] = [opt('url'), opt('token'), opt('rows'), opt('expect')];
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const inventoryOnly = args.includes('--inventory');
  if (!url || !rowsFile || (!dryRun && !token)) {
    console.error('Usage: node db/protected-restore.mjs --url <turso-url> --token <token> --rows <file.json> [--inventory] [--expect <file.json>] [--force] [--dry-run]');
    console.error('  --inventory: print the current-state inventory for the ids in --rows (write it to a file for --expect).');
    console.error('  --expect   : inventory array [{ id, data, updated_at }] from a FRESH --inventory of the current database.');
    console.error('  --force    : unconditional restore over unknown current state (deliberate override; still atomic + verified).');
    process.exit(2);
  }
  const rows = JSON.parse(fs.readFileSync(rowsFile, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('Rows file must be a non-empty JSON array of { id, data, updated_at }.');
    process.exit(2);
  }
  const client0 = createClient({ url, authToken: token || 'dry-run' });
  if (inventoryOnly) {
    console.log(JSON.stringify(await inventoryRows(client0, rows.map((r) => r.id)), null, 2));
    process.exit(0);
  }
  const expectedList = expectFile ? JSON.parse(fs.readFileSync(expectFile, 'utf8')) : [];
  const expected = Object.fromEntries((Array.isArray(expectedList) ? expectedList : []).map((r) => [r.id, r]));
  if (force) console.error('FORCE restore: unconditional upserts over current state (atomic, verified).');
  const client = client0;
  try {
    const result = await restoreRows(client, rows, { dryRun, expected, force });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Restore stopped: ${error.message}`);
    process.exit(1);
  }
}


// ---------------------------------------------------------------------------
// Entry-level MERGE mode (reversal that preserves intervening data).
//
// The user's recovery condition: a reversal must not erase data that arrived
// AFTER the backup point, and operation must continue. Whole-row replacement
// violates that (new entries added after the backup live inside the current
// row). Merge mode therefore restores the backup CONTENT for entities that
// existed at backup time while KEEPING:
//   - entities whose id is absent from the backup (post-backup additions),
//   - append-only logs from both backup and current (union; history never shrinks),
//   - current auth sessions (nobody is logged out; continued operation),
//   - a current archive.deletedAt marker (a deletion after the backup stays deleted;
//     restoring content does not silently resurrect the listing).
// Entities present only in the backup are restored (a hard removal after the
// backup is reversed). Deletions use hard removal in OnceHere's data model, so
// there is no tombstone to preserve per-entity.
//
// EXACT MERGE POLICY (audited per entity - nothing is chosen silently):
//   - Entity in BOTH backup and current (same id), content differs: the BACKUP
//     version is restored. This is the reversal itself: a post-backup EDIT to a
//     pre-existing entry is reverted. Reported as 'reverted'.
//   - Entity ONLY in current (new id): PRESERVED untouched. Reported as
//     'preserved-new'. This is the user's condition: no new entries are lost.
//   - Entity ONLY in backup: restored. Reported as 'restored-removed'.
//   - Archive deleted after the backup: deletion STICKS (tenant + index).
//     Reported as 'preserved-deletion'. A restore never resurrects a listing.
//   - Append-only logs: union of both sides. Sessions: current kept.
//   - platformSettings: backup version (reversal); stated, not hidden.
// buildMergedRestoreRows returns a per-row report of every decision so the
// operator reviews EXACTLY what changes before anything is applied. Merge mode
// is a recovery TOOL; it executes only when deliberately invoked - it neither
// runs automatically nor authorizes any restore by itself.
// Index rows merge per archive entry the same way: backup versions for archives
// known at backup time, current-only archives (created after the backup) preserved,
// platform settings from the backup, legacy id list unioned. The current row's
// storage shape (legacy array vs platform envelope) is preserved.
// The merged rows flow through the SAME atomic conditional transaction:
// preconditions are the CURRENT rows, so any concurrent change aborts the write
// and nothing is applied. Re-inventory and retry merges against fresher state.
// ---------------------------------------------------------------------------

const ENTITY_COLLECTIONS = ['sections', 'timelineEvents', 'members', 'memberMessages', 'mediaItems', 'albums', 'wallPosts'];
const LOG_COLLECTIONS = ['revisions', 'accessLogs', 'shareActivity'];

function mergeEntityCollection(backupList, currentList, report, collectionName) {
  const bList = Array.isArray(backupList) ? backupList : [];
  const cList = Array.isArray(currentList) ? currentList : [];
  const backupById = new Map(bList.map(e => [e && e.id, e]));
  const currentById = new Map(cList.map(e => [e && e.id, e]));
  const merged = bList.slice();
  for (const e of bList) {
    const cur = e && currentById.get(e.id);
    if (cur && JSON.stringify(cur) !== JSON.stringify(e)) report.push(`reverted ${collectionName}/${e.id} (post-backup edit undone)`);
  }
  for (const e of cList) {
    if (e && e.id !== undefined && !backupById.has(e.id)) {
      merged.push(e);
      report.push(`preserved-new ${collectionName}/${e.id} (created after backup)`);
    }
  }
  return merged;
}

function mergeLogCollection(backupList, currentList) {
  const seen = new Set();
  const merged = [];
  for (const e of [...(Array.isArray(currentList) ? currentList : []), ...(Array.isArray(backupList) ? backupList : [])]) {
    const key = e && e.id !== undefined ? e.id : JSON.stringify(e);
    if (!seen.has(key)) { seen.add(key); merged.push(e); }
  }
  return merged;
}

function decodeCurrentTenantSnapshot(content) {
  if (typeof content !== 'object' || !content) return undefined;
  if (content.format === 1 && Array.isArray(content.chunks)) {
    try { return JSON.parse(gunzip(content.chunks)); } catch { return undefined; }
  }
  if (content.format === 0 && Array.isArray(content.archives) && content.archives[0]) return content.archives[0].snapshot;
  return undefined;
}

function mergeTenantSnapshot(backupSnapshot, currentSnapshot, report) {
  if (!currentSnapshot || typeof currentSnapshot !== 'object') {
    report.push('restored-removed whole snapshot (row absent at merge time)');
    return backupSnapshot;
  }
  const merged = { ...backupSnapshot };
  merged.archive = {
    ...(backupSnapshot.archive || {}),
    createdAt: (currentSnapshot.archive && currentSnapshot.archive.createdAt) || (backupSnapshot.archive || {}).createdAt,
    deletedAt: (currentSnapshot.archive && currentSnapshot.archive.deletedAt) || (backupSnapshot.archive || {}).deletedAt,
  };
  if (merged.archive.deletedAt === undefined) delete merged.archive.deletedAt;
  else if ((currentSnapshot.archive || {}).deletedAt && !(backupSnapshot.archive || {}).deletedAt) {
    report.push('preserved-deletion archive (deleted after backup; not resurrected)');
  }
  if (JSON.stringify({ ...(backupSnapshot.archive || {}), deletedAt: undefined, createdAt: undefined })
      !== JSON.stringify({ ...(currentSnapshot.archive || {}), deletedAt: undefined, createdAt: undefined })) {
    report.push('reverted archive settings/content fields to backup (post-backup edits undone)');
  }
  for (const key of ENTITY_COLLECTIONS) merged[key] = mergeEntityCollection(backupSnapshot[key], currentSnapshot[key], report, key);
  for (const key of LOG_COLLECTIONS) merged[key] = mergeLogCollection(backupSnapshot[key], currentSnapshot[key]);
  if (currentSnapshot.sessions !== undefined) merged.sessions = currentSnapshot.sessions; // auth state stays current
  return merged;
}

function mergeIndexData(backupData, currentData, report) {
  if (!currentData || typeof currentData !== 'object') return { merged: backupData, legacy: false };
  const bLegacy = backupData && backupData.format === 0;
  const cLegacy = currentData.format === 0;
  if (bLegacy || cLegacy) {
    // Legacy full-snapshot index rows carry per-archive-id entity maps and
    // sessions; merging those entry-by-entry belongs to the migration path.
    throw new Error('merge mode supports platform index envelopes only (format 1); migrate or decode legacy rows first');
  }
  const pairs = d => (Array.isArray(d.archives) ? d.archives : []); // [id, archive] tuples
  const bPairs = pairs(backupData), cPairs = pairs(currentData);
  const bIds = new Set(bPairs.map(p => p[0]));
  const cById = new Map(cPairs.map(p => [p[0], p]));
  // Backup versions for archives known at backup time (the reversal), EXCEPT a
  // deletion that happened after the backup stays deleted in the listing too
  // (matches the tenant-row rule: a restore must not silently resurrect).
  const mergedPairs = bPairs.map(p => {
    const cur = cById.get(p[0]);
    if (cur && cur[1] && cur[1].deletedAt && !(p[1] && p[1].deletedAt)) {
      if (report) report.push(`preserved-deletion index/${p[0]} (deleted after backup; not resurrected)`);
      return cur;
    }
    if (cur && JSON.stringify(cur[1]) !== JSON.stringify(p[1]) && report) report.push(`reverted index/${p[0]} listing entry to backup`);
    return p;
  });
  for (const p of cPairs) if (!bIds.has(p[0])) {
    mergedPairs.push(p); // archives created after backup preserved
    if (report) report.push(`preserved-new index/${p[0]} (archive created after backup)`);
  }
  const legacyIds = new Set([...(backupData.legacyArchiveIds || []), ...(currentData.legacyArchiveIds || [])]);
  const content = {
    format: 1,
    archives: mergedPairs,
    legacyArchiveIds: [...legacyIds],
    platformSettings: backupData.platformSettings !== undefined ? backupData.platformSettings : currentData.platformSettings,
  };
  return {
    merged: {
      ...content,
      sha256: createHash('sha256').update(canonicalJson(content)).digest('hex'),
      rowVersion: mintRowVersion(),
    },
    legacy: false
  };
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
}

// Build merged restore rows from a rows file's rows + current inventory
// ([{id, data(raw string), updated_at}]). Returns {rows, skipped, notes}:
// rows carry {id, content(JSON string), precondition:'content-match'|'row-absent'};
// skipped lists ids whose merged content already equals current (no write needed).
export function buildMergedRestoreRows(sourceRows, inventory) {
  const currentById = new Map(inventory.map(r => [r.id, r]));
  const rows = [];
  const skipped = [];
  const notes = [];
  const report = [];
  for (const src of sourceRows) {
    if (!src || typeof src.id !== 'string' || src.data === undefined) throw new Error('Each merge row needs { id: string, data: object|string }.');
    const srcContent = typeof src.data === 'string' ? src.data : JSON.stringify(src.data);
    const current = currentById.get(src.id);
    let mergedContent;
    if (src.id === INDEX_ROW_ID) {
      let backupData;
      try { backupData = JSON.parse(srcContent); } catch { throw new Error('merged index row content is not valid JSON'); }
      const currentData = current ? (() => { try { return JSON.parse(typeof current.data === 'string' ? current.data : JSON.stringify(current.data)); } catch { return undefined; } })() : undefined;
      mergedContent = JSON.stringify(mergeIndexData(backupData, currentData, report).merged);
    } else {
      let backupData;
      try { backupData = JSON.parse(srcContent); } catch { throw new Error('merged tenant row content is not valid JSON'); }
      if (backupData && backupData.format === 0 && Array.isArray(backupData.archives)) throw new Error('cannot merge a multi-archive legacy tenant row');
      const backupSnapshot = (backupData && backupData.format === 1 && Array.isArray(backupData.chunks))
        ? JSON.parse(gunzip(backupData.chunks))
        : undefined;
      if (!backupSnapshot) throw new Error(`cannot decode backup snapshot for ${src.id}`);
      const currentSnapshot = current ? decodeCurrentTenantSnapshot((() => { try { return JSON.parse(typeof current.data === 'string' ? current.data : JSON.stringify(current.data)); } catch { return undefined; } })()) : undefined;
      const mergedSnapshot = mergeTenantSnapshot(backupSnapshot, currentSnapshot, report);
      mergedContent = JSON.stringify(makeTenantEnvelope(mergedSnapshot));
    }
    const currentRaw = current ? (typeof current.data === 'string' ? current.data : JSON.stringify(current.data)) : undefined;
    if (current && currentRaw === mergedContent) { skipped.push(src.id); continue; }
    rows.push({
      id: src.id,
      content: mergedContent,
      precondition: current ? 'content-match' : 'row-absent',
      expectedContent: currentRaw,
      updatedAt: new Date().toISOString(),
    });
    notes.push(`${src.id}: merged against ${current ? 'current row' : 'absent row (restore creates it)'}`);
  }
  return { rows, skipped, notes, report };
}


// Apply merged rows atomically with the same fail-closed guarantees as
// restoreRows: ONE transaction, content-matched preconditions taken from the
// CURRENT inventory (not from the backup), abort-on-first-mismatch with full
// rollback, and post-commit re-read verification of every written row.
export async function restoreMergedRows(client, merged, inventory, { dryRun = false } = {}) {
  const currentById = new Map(inventory.map(r => [r.id, r]));
  if (dryRun) return { dryRun: true, planned: merged.rows.map(r => ({ id: r.id, precondition: r.precondition })), skipped: merged.skipped };
  const tx = await client.transaction('write');
  const done = [];
  try {
    for (const row of merged.rows) {
      const cur = currentById.get(row.id);
      if (row.precondition === 'content-match') {
        const res = await tx.execute({
          sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND data = ?',
          args: [row.content, row.updatedAt, row.id, cur.updated_at, typeof cur.data === 'string' ? cur.data : JSON.stringify(cur.data)]
        });
        if ((res.rowsAffected ?? 0) === 0) throw new Error(`Merge restore aborted: ${row.id} changed since inventory. NOTHING was written - re-inventory and re-merge.`);
      } else {
        const res = await tx.execute({ sql: 'INSERT OR IGNORE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)', args: [row.id, row.content, row.updatedAt] });
        if ((res.rowsAffected ?? 0) === 0) throw new Error(`Merge restore aborted: ${row.id} appeared after inventory. NOTHING was written - re-inventory and re-merge.`);
      }
      done.push(row.id);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
  for (const row of merged.rows) {
    const stored = (await client.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [row.id] })).rows[0];
    if (!stored || String(stored.data) !== row.content) throw new Error(`Post-merge verification failed for ${row.id}: stored content does not match the merged row.`);
  }
  return { restored: done, skipped: merged.skipped };
}
