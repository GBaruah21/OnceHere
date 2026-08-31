import { PLATFORM_CONFIG } from '../config/platform';

export interface TenantResolution {
  type: 'platform' | 'public_archive' | 'workspace_editor' | 'custom_domain';
  identifier?: string;
  isWorkspace: boolean;
  slug?: string;
}

export interface TenantContext {
  type: 'platform' | 'archive' | 'workspace';
  slug?: string;
  workspaceSlug?: string;
}

export function resolveTenantContext(pathname: string, hostname?: string): TenantContext {
  const resolution = resolveTenant(pathname, hostname);
  if (resolution.type === 'workspace_editor') {
    return {
      type: 'workspace',
      workspaceSlug: resolution.identifier
    };
  }
  if (resolution.type === 'public_archive') {
    return {
      type: 'archive',
      slug: resolution.identifier
    };
  }
  return {
    type: 'platform'
  };
}

/**
 * Single centralized tenant resolver that extracts tenant identity from URL path or hostname
 */
export function resolveTenant(pathname: string, hostname?: string): TenantResolution {
  const cleanPath = pathname.trim();

  // 0. If path is root or empty, it is always the platform landing page
  if (!cleanPath || cleanPath === '/' || cleanPath === '/explore' || cleanPath === '/create') {
    return {
      type: 'platform',
      isWorkspace: false
    };
  }

  // 1. Check for workspace / editor paths
  if (cleanPath.startsWith('/workspace/')) {
    const workspaceSlug = cleanPath.replace('/workspace/', '').split('/')[0];
    if (workspaceSlug) {
      return {
        type: 'workspace_editor',
        identifier: workspaceSlug,
        isWorkspace: true,
        slug: workspaceSlug
      };
    }
  }

  if (cleanPath.startsWith('/editor/')) {
    const workspaceSlug = cleanPath.replace('/editor/', '').split('/')[0];
    if (workspaceSlug) {
      return {
        type: 'workspace_editor',
        identifier: workspaceSlug,
        isWorkspace: true,
        slug: workspaceSlug
      };
    }
  }

  // 2. Check for immediate path-based public archive URL: /s/:slug or /archive/:slug
  if (cleanPath.startsWith('/s/')) {
    const slug = cleanPath.replace('/s/', '').split('/')[0];
    if (slug && !PLATFORM_CONFIG.reservedSlugs.includes(slug as any)) {
      return {
        type: 'public_archive',
        identifier: slug,
        isWorkspace: false,
        slug
      };
    }
  }

  if (cleanPath.startsWith('/archive/')) {
    const slug = cleanPath.replace('/archive/', '').split('/')[0];
    if (slug && !PLATFORM_CONFIG.reservedSlugs.includes(slug as any)) {
      return {
        type: 'public_archive',
        identifier: slug,
        isWorkspace: false,
        slug
      };
    }
  }

  // 3. Check for custom domain or dedicated archive subdomain (only for custom domains, not cloud provider hosts)
  if (hostname) {
    const hostWithoutPort = hostname.split(':')[0].toLowerCase();
    
    // Ignore localhost, IP addresses, and known platform hosting domains
    const isPlatformHost =
      hostWithoutPort === 'localhost' ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostWithoutPort) ||
      hostWithoutPort.endsWith('.run.app') ||
      hostWithoutPort.endsWith('.google.com') ||
      hostWithoutPort.endsWith('.aistudio.google.com') ||
      hostWithoutPort.endsWith('.web.app') ||
      hostWithoutPort.endsWith('.firebaseapp.com') ||
      hostWithoutPort.endsWith('.vercel.app') ||
      hostWithoutPort.endsWith('.netlify.app') ||
      hostWithoutPort.endsWith('.onrender.com') ||
      hostWithoutPort.endsWith('.pages.dev') ||
      hostWithoutPort.endsWith('.ngrok.io') ||
      hostWithoutPort.endsWith('.ngrok-free.app');

    if (!isPlatformHost) {
      const parts = hostWithoutPort.split('.');
      if (parts.length > 2) {
        const subdomain = parts[0];
        if (
          subdomain &&
          !['www', 'api', 'app', 'dev', 'staging', 'admin'].includes(subdomain) &&
          !PLATFORM_CONFIG.reservedSlugs.includes(subdomain as any)
        ) {
          return {
            type: 'public_archive',
            identifier: subdomain,
            isWorkspace: false,
            slug: subdomain
          };
        }
      }
    }
  }

  // Default: Main platform landing/explore/create page
  return {
    type: 'platform',
    isWorkspace: false
  };
}

/**
 * Slug cleaner & generator matching strict specification:
 * - Lowercase letters, numbers, and hyphens only
 * - Remove apostrophes & unsupported symbols
 * - Convert spaces to single hyphens
 * - Prevent leading, trailing, or repeated hyphens
 * - Length between 3 and 50 characters
 * - Blocks reserved keywords
 */
export function sanitizeSlug(input: string): string {
  let slug = input
    .toLowerCase()
    .replace(/['’]/g, '') // remove apostrophes
    .replace(/[^a-z0-9]+/g, '-') // convert non-alphanumeric to hyphen
    .replace(/^-+|-+$/g, '') // remove leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // collapse multiple hyphens

  if (slug.length > 50) {
    slug = slug.substring(0, 50).replace(/-+$/, '');
  }

  return slug;
}

export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, error: 'Address cannot be empty.' };
  }
  if (slug.length < 3) {
    return { valid: false, error: 'Address must be at least 3 characters long.' };
  }
  if (slug.length > 50) {
    return { valid: false, error: 'Address cannot exceed 50 characters.' };
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return {
      valid: false,
      error: 'Only lowercase letters, numbers, and single hyphens are allowed. Cannot start or end with a hyphen.'
    };
  }
  if (PLATFORM_CONFIG.reservedSlugs.includes(slug as any)) {
    return { valid: false, error: 'This address is reserved by the platform.' };
  }

  return { valid: true };
}
