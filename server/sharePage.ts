import type { Request, Response } from 'express';
import { db } from './db.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cleanSlug(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);
}

export async function renderArchiveSharePage(req: Request, res: Response) {
  await db.ensureLoaded();

  const slug = cleanSlug(req.params.slug || req.query.slug);
  const archive = slug ? db.findBySlug(slug) : undefined;
  const mayDescribeArchive = Boolean(
    archive &&
    !archive.deletedAt &&
    archive.deploymentStatus === 'deployed' &&
    archive.visibility !== 'private'
  );

  const title = mayDescribeArchive
    ? `${archive!.title} · OnceHere`
    : 'OnceHere · Every chapter deserves a place to live.';
  const description = mayDescribeArchive
    ? (archive!.subtitle?.trim() || `${archive!.organizationName} · ${archive!.startYear}–${archive!.endYear} digital memory archive on OnceHere.`)
    : 'A digital memory archive on OnceHere.';
  const archivePath = slug ? `/s/${encodeURIComponent(slug)}` : '/';
  const origin = `${req.protocol}://${req.get('host')}`;
  const canonicalUrl = `${origin}${archivePath}`;

  // This is a crawler-friendly bridge only. The real archive remains the SPA
  // at /s/:slug. Private/draft/missing archives never expose their title or
  // contents through this page.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:site_name" content="OnceHere" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(archivePath)}" />
</head>
<body>
  <p>Opening <a href="${escapeHtml(archivePath)}">OnceHere</a>…</p>
  <script>location.replace(${JSON.stringify(archivePath).replaceAll('<', '\\u003c')});</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', mayDescribeArchive
    ? 'public, max-age=60, stale-while-revalidate=300'
    : 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  return res.status(200).send(html);
}
