import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const archiveId = process.env.ARCHIVE_ID || 'arc-1788769556030-1prlz';
const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const headers = key.startsWith('sb_secret_')
  ? { apikey: key }
  : { apikey: key, Authorization: `Bearer ${key}` };

async function request(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
        signal: AbortSignal.timeout(120_000)
      });
      if (response.ok) return response.status === 204 ? undefined : response.json();
      const detail = await response.text();
      lastError = new Error(`Supabase request failed (${response.status}): ${detail}`);
      if (![500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  throw lastError;
}

async function readRows(ids) {
  // The legacy table is severely bloated. Small indexed reads are slow but avoid
  // PostgREST timing out while planning one wide IN query against that table.
  const rows = [];
  for (const id of ids) {
    const result = await request(`oncehere_state?id=eq.${encodeURIComponent(id)}&select=id,data`);
    if (result[0]) rows.push(result[0]);
  }
  return rows;
}

function decode(chunks, expectedSha256) {
  const json = gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8');
  const actual = createHash('sha256').update(json).digest('hex');
  if (actual !== expectedSha256) throw new Error('Legacy snapshot integrity check failed.');
  return JSON.parse(json);
}

function encode(snapshot) {
  const json = JSON.stringify(snapshot);
  const payload = gzipSync(Buffer.from(json, 'utf8'), { level: 6 }).toString('base64');
  const chunks = [];
  for (let offset = 0; offset < payload.length; offset += 64 * 1024) chunks.push(payload.slice(offset, offset + 64 * 1024));
  return { chunks, sha256: createHash('sha256').update(json).digest('hex') };
}

function valueFor(snapshot, key) {
  const entries = snapshot[key];
  return Array.isArray(entries) ? entries.find(([id]) => id === archiveId)?.[1] : undefined;
}

const indexRow = (await readRows(['tenant-index']))[0];
if (!indexRow?.data) throw new Error('Missing tenant-index row.');
if (!(indexRow.data.legacyArchiveIds || []).includes(archiveId)) {
  console.log(`Archive ${archiveId} is already independent; nothing to do.`);
  process.exit(0);
}

const manifest = (await readRows(['manifest']))[0]?.data;
if (!manifest?.generation || !Number.isInteger(manifest.chunkCount) || !manifest.sha256) {
  throw new Error('Legacy manifest is missing or invalid.');
}

const ids = Array.from({ length: manifest.chunkCount }, (_, index) =>
  `snapshot-${manifest.generation}-${String(index).padStart(6, '0')}`
);
const batches = [];
for (let offset = 0; offset < ids.length; offset += 10) batches.push(ids.slice(offset, offset + 10));
const rows = [];
for (const [index, batch] of batches.entries()) {
  rows.push(...await readRows(batch));
  if ((index + 1) % 10 === 0 || index + 1 === batches.length) {
    console.log(`Read ${Math.min((index + 1) * 10, ids.length)} of ${ids.length} legacy chunks.`);
  }
}
const payloads = new Map(rows.map((row) => [row.id, row.data?.payload]));
const chunks = ids.map((id) => payloads.get(id));
if (chunks.some((chunk) => typeof chunk !== 'string')) throw new Error('Legacy snapshot is incomplete.');

const legacy = decode(chunks, manifest.sha256);
const archive = valueFor(legacy, 'archives');
if (!archive) throw new Error(`Archive ${archiveId} is not present in the active legacy snapshot.`);
const sessions = Array.isArray(legacy.sessions)
  ? legacy.sessions.filter(([, session]) => session?.archiveId === archiveId)
  : [];
const tenant = {
  archive,
  sections: valueFor(legacy, 'sections') || [],
  timelineEvents: valueFor(legacy, 'timelineEvents') || [],
  members: valueFor(legacy, 'members') || [],
  memberMessages: valueFor(legacy, 'memberMessages') || [],
  mediaItems: valueFor(legacy, 'mediaItems') || [],
  albums: valueFor(legacy, 'albums') || [],
  wallPosts: valueFor(legacy, 'wallPosts') || [],
  revisions: valueFor(legacy, 'revisions') || [],
  accessLogs: valueFor(legacy, 'accessLogs') || [],
  shareActivity: valueFor(legacy, 'shareActivity') || [],
  sessions
};
const encoded = encode(tenant);
const now = new Date().toISOString();
const nextIndex = {
  ...indexRow.data,
  legacyArchiveIds: indexRow.data.legacyArchiveIds.filter((id) => id !== archiveId)
};

await request('oncehere_state?on_conflict=id', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([
    { id: `tenant-${archiveId}`, data: { format: 1, chunks: encoded.chunks, compression: 'gzip', sha256: encoded.sha256 }, updated_at: now },
    { id: 'tenant-index', data: nextIndex, updated_at: now }
  ])
});

const verified = await readRows([`tenant-${archiveId}`, 'tenant-index']);
const tenantRow = verified.find((row) => row.id === `tenant-${archiveId}`)?.data;
const verifiedIndex = verified.find((row) => row.id === 'tenant-index')?.data;
if (tenantRow?.format !== 1 || !Array.isArray(tenantRow.chunks) || !tenantRow.sha256
  || (verifiedIndex?.legacyArchiveIds || []).includes(archiveId)) {
  throw new Error('Extraction write verification failed. Legacy data has been left untouched.');
}
console.log(`Extracted and verified ${archiveId}: ${archive.title || 'untitled archive'}`);
