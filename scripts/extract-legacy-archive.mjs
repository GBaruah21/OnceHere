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
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function readRows(ids) {
  return request(`oncehere_state?id=in.(${ids.join(',')})&select=id,data&order=id.asc`);
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
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < batches.length) rows.push(...await readRows(batches[next++]));
}));
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
