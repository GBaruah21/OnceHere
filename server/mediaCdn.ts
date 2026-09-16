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
