/**
 * Central Platform Identity & Configuration
 * 
 * To rename or rebrand the platform in the future, update this single file.
 * Do not hardcode the platform name elsewhere in the codebase.
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
    emailText: 'Email'
  },
  urls: {
    baseDomain: typeof window !== 'undefined' ? window.location.host : 'localhost:3000',
    pathPrefix: '/s/',
    workspacePrefix: '/workspace/'
  },
  limits: {
    maxImageSizeMB: 15,
    maxVideoSizeMB: 150,
    maxBatchUploadCount: 30,
    maxWallMessageLength: 500,
    maxFailedPinAttempts: 5,
    pinLockoutMinutes: 15,
    editorSessionHours: 2,
    retentionDays: 30
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
