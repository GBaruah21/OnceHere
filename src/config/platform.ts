/**
 * Central Platform Identity & Configuration
 *
 * To rename or rebrand the platform in the future, update this single file.
 * Do not hardcode the platform name elsewhere in the codebase.
 *
 * IMPORTANT: server/r2.ts is the enforcement source of truth for upload/storage
 * quotas. Keep this user-facing summary aligned with R2_LIMITS whenever quotas
 * change.
 */

export const PLATFORM_CONFIG = {
  name: 'OnceHere',
  tagline: 'Every chapter deserves a place to live.',
  description: 'Create and deploy beautifully tailored digital memory archives and yearbooks for schools, colleges, sports teams, trips, reunions, and communities.',
  version: '1.0.0',
  author: {
    name: '@_g.baruah_',
    instagram: 'https://www.instagram.com/_g.baruah_/',
    email: 'mailto:workwithgitam@gmail.com',
    displayHandle: '@_g.baruah_'
  },
  attribution: {
    prefix: 'Created with',
    builtByText: 'Built by',
    instagramText: 'Follow on Instagram',
    emailText: 'Email',
    shareCredit: 'Created with OnceHere · @_g.baruah_',
    shareRequest: 'A tag or mention to the creator, @_g.baruah_, would be genuinely appreciated. I’d also love to hear about your experience—feedback is always welcome in DMs.'
  },
  urls: {
    baseDomain: typeof window !== 'undefined' ? window.location.host : 'localhost:3000',
    pathPrefix: '/s/',
    workspacePrefix: '/workspace/'
  },
  limits: {
    // File limits
    maxImageSizeMB: 10,
    maxVideoSizeMB: 59,

    // Section quotas. These are attachment/portrait allowances, not a single
    // combined media count. The shared archive-wide video and 500 MB storage
    // ceilings also apply.
    maxVaultAttachments: 100,
    maxVaultVideos: 5,
    maxMemberPortraits: 250,
    maxTimelineAttachments: 20,
    maxTimelineVideos: 3,
    maxArchiveVideos: 5,
    maxWallImageAttachments: 5,
    maxMediaStorageMBPerArchive: 500,

    // Interaction/security limits
    maxWallMessageLength: 500,
    maxFailedPinAttempts: 5,
    pinLockoutMinutes: 15,
    editorSessionHours: 2
  },
  reservedSlugs: [
    'admin',
    'api',
    'app',
    'www',
    'help',
    'support',
    'login',
    'create',
    'settings',
    'assets',
    'demo',
    'workspace',
    'editor',
    'static',
    'auth',
    'dashboard',
    'status',
    's'
  ]
} as const;

export type PlatformConfig = typeof PLATFORM_CONFIG;
