import crypto from 'node:crypto';

export type PublicMediaArchive = {
  id: string;
  visibility: string;
  deploymentStatus: string;
};

function configuredBaseUrl(): string | undefined {
  const raw = process.env.MEDIA_CDN_BASE_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function configuredOriginSecret(): string | undefined {
  const value = process.env.MEDIA_CDN_ORIGIN_SECRET?.trim();
  return value && value.length >= 24 ? value : undefined;
}

export function isTrustedMediaCdnOrigin(candidate?: string): boolean {
  const expected = configuredOriginSecret();
  const supplied = candidate?.trim();
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function publicMediaCdnUrl(
  archive: PublicMediaArchive,
  fileName: string,
  originSecretHeader?: string
): string | undefined {
  const baseUrl = configuredBaseUrl();
  const originSecret = configuredOriginSecret();
  if (!baseUrl || !originSecret) return undefined;
  if (archive.visibility !== 'public' || archive.deploymentStatus !== 'deployed') return undefined;
  if (isTrustedMediaCdnOrigin(originSecretHeader)) return undefined;
  return `${baseUrl}/media/${encodeURIComponent(archive.id)}/${encodeURIComponent(fileName)}`;
}

export function mediaCdnStatus() {
  return {
    enabled: Boolean(configuredBaseUrl() && configuredOriginSecret()),
    baseUrlConfigured: Boolean(configuredBaseUrl()),
    originSecretConfigured: Boolean(configuredOriginSecret())
  };
}

function directLinksEnabled(): boolean {
  return process.env.MEDIA_CDN_DIRECT_LINKS?.trim() === '1';
}

/**
 * For anonymous visitors of a deployed PUBLIC archive, point media straight at the
 * Cloudflare Worker instead of OnceHere's /media-object redirect. That removes one
 * Vercel request per image. Only the response copy is changed: stored data is never
 * rewritten, and owners/editors/viewers keep the original same-origin URLs.
 * Off unless MEDIA_CDN_DIRECT_LINKS=1 and the CDN itself is configured.
 */
export function rewritePublicMediaUrls<T>(archive: PublicMediaArchive, payload: T): T {
  if (!directLinksEnabled()) return payload;
  if (archive.visibility !== 'public' || archive.deploymentStatus !== 'deployed') return payload;
  const prefix = `/api/archives/${encodeURIComponent(archive.id)}/media-object/`;
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (!value.startsWith(prefix)) return value;
      const encodedName = value.slice(prefix.length);
      let fileName: string;
      try { fileName = decodeURIComponent(encodedName); } catch { return value; }
      if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return value;
      return publicMediaCdnUrl(archive, fileName) ?? value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(payload) as T;
}
