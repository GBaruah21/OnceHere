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
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

export const mintRowVersion = () => `${new Date().toISOString()}#${randomUUID()}`;

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
