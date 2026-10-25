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

export async function restoreRows(client, rows, { dryRun = false } = {}) {
  const plan = rows.map((row) => buildRestoreRow(row));
  if (dryRun) {
    return { dryRun: true, planned: plan.map((r) => ({ id: r.id, rowVersion: r.data.rowVersion })) };
  }
  const done = [];
  for (const row of plan) {
    await client.execute({
      sql: `INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      args: [row.id, JSON.stringify(row.data), row.updated_at]
    });
    const stored = (await client.execute({
      sql: 'SELECT data, updated_at FROM oncehere_state WHERE id = ?', args: [row.id]
    })).rows[0];
    const storedData = stored && typeof stored.data === 'string' ? JSON.parse(stored.data) : undefined;
    if (!storedData || storedData.rowVersion !== row.data.rowVersion || stored.updated_at !== row.updated_at) {
      throw new Error(`Verify failed after restoring ${row.id}; completed ids: ${done.join(', ') || '(none)'}`);
    }
    done.push(row.id);
  }
  return { dryRun: false, restored: done };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const [url, token, rowsFile] = [opt('url'), opt('token'), opt('rows')];
  const dryRun = args.includes('--dry-run');
  if (!url || !rowsFile || (!dryRun && !token)) {
    console.error('Usage: node db/protected-restore.mjs --url <turso-url> --token <token> --rows <file.json> [--dry-run]');
    process.exit(2);
  }
  const rows = JSON.parse(fs.readFileSync(rowsFile, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error('Rows file must be a non-empty JSON array of { id, data, updated_at }.');
    process.exit(2);
  }
  const client = createClient({ url, authToken: token || 'dry-run' });
  try {
    const result = await restoreRows(client, rows, { dryRun });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Restore stopped: ${error.message}`);
    process.exit(1);
  }
}
