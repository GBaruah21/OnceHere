import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const R2_LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 20 * 1024 * 1024,
  maxImagesPerArchive: 50,
  maxVideosPerArchive: 2,
  maxTotalBytesPerArchive: 100 * 1024 * 1024
} as const;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);

// B2's dashboard presets have proved unreliable for S3 virtual-hosted upload
// URLs. Configure the S3 CORS policy from the same credentials used to sign
// uploads, once per server instance. The signed URL still controls write
// access; this only lets browsers perform the required OPTIONS preflight.
let corsConfiguredBucket: string | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`R2 is not configured: missing ${name}`);
  return value;
}

export function isR2Configured(): boolean {
  const generic = ['OBJECT_STORAGE_ENDPOINT', 'OBJECT_STORAGE_ACCESS_KEY_ID', 'OBJECT_STORAGE_SECRET_ACCESS_KEY', 'OBJECT_STORAGE_BUCKET']
    .every((name) => Boolean(process.env[name]?.trim()));
  const cloudflare = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']
    .every((name) => Boolean(process.env[name]?.trim()));
  return generic || cloudflare;
}

function client(): S3Client {
  const configuredEndpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim().replace(/\/$/, '');
  const genericEndpoint = configuredEndpoint && !/^https?:\/\//i.test(configuredEndpoint)
    ? `https://${configuredEndpoint}`
    : configuredEndpoint;
  return new S3Client({
    region: process.env.OBJECT_STORAGE_REGION?.trim() || (genericEndpoint ? 'us-east-1' : 'auto'),
    endpoint: genericEndpoint || `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || required('R2_ACCESS_KEY_ID'),
      secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() || required('R2_SECRET_ACCESS_KEY')
    },
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    // Presigned browser PUTs have no body while being signed. The SDK's default
    // checksum middleware otherwise signs the CRC32 of an empty body, which B2
    // correctly rejects when the browser later sends the real file.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  });
}

function bucketName(): string {
  return process.env.OBJECT_STORAGE_BUCKET?.trim() || required('R2_BUCKET_NAME');
}

export function validateUpload(type: string, size: number): 'image' | 'video' {
  if (!ALLOWED_TYPES.has(type)) throw new Error('Unsupported file type. Use JPG, PNG, WebP, AVIF, GIF, MP4, WebM, or MOV.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid file size.');
  const kind = type.startsWith('video/') ? 'video' : 'image';
  const limit = kind === 'video' ? R2_LIMITS.videoBytes : R2_LIMITS.imageBytes;
  if (size > limit) throw new Error(`${kind === 'video' ? 'Video' : 'Image'} exceeds the ${Math.floor(limit / 1024 / 1024)} MB limit.`);
  return kind;
}

export function createObjectKey(archiveId: string, contentType: string): string {
  const extension: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
  };
  return `archives/${archiveId}/${Date.now()}-${crypto.randomUUID()}.${extension[contentType]}`;
}

export function publicObjectUrl(key: string): string {
  const [, archiveId, fileName] = key.split('/');
  return `/api/archives/${encodeURIComponent(archiveId)}/media-object/${encodeURIComponent(fileName)}`;
}

async function ensureBrowserCors(): Promise<void> {
  const bucket = bucketName();
  if (corsConfiguredBucket === bucket) return;
  try {
    await client().send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT'],
          AllowedOrigins: [
            'https://oncehere.vercel.app',
            'https://oncehere-gbaruah-projects.vercel.app',
            'https://oncehere-git-main-gbaruah-projects.vercel.app',
            'https://oncehere-the-forever-home-of-memories.onrender.com'
          ],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600
        }]
      }
    }));
    corsConfiguredBucket = bucket;
  } catch (error) {
    // Do not turn a provider-side CORS-management limitation into an outage.
    // The existing bucket rule may already be valid; the presigned upload can
    // still proceed in that case.
    console.error('Unable to apply object-storage CORS policy:', error);
  }
}

export async function createUploadUrl(key: string, contentType: string, _size: number): Promise<string> {
  await ensureBrowserCors();
  return getSignedUrl(client(), new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    ContentType: contentType
  }), { expiresIn: 10 * 60 });
}

export async function verifyObject(key: string, expectedType: string, expectedSize: number) {
  const result = await inspectObject(key);
  if (result.ContentLength !== expectedSize || result.ContentType !== expectedType) {
    throw new Error('Uploaded file verification failed. Please remove it and retry.');
  }
  return result;
}

export async function inspectObject(key: string) {
  return client().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
}

/**
 * Checks that the deployed credentials can reach the configured bucket without
 * exposing its credentials or issuing any write/delete operation.
 */
export async function checkStorageConnection(): Promise<{ connected: boolean; code?: string }> {
  if (!isR2Configured()) return { connected: false, code: 'not-configured' };
  try {
    await client().send(new ListObjectsV2Command({ Bucket: bucketName(), MaxKeys: 1 }));
    return { connected: true };
  } catch (error) {
    const code = error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name || 'connection-failed')
      : 'connection-failed';
    return { connected: false, code };
  }
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

export async function createDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucketName(),
    Key: key
  }), { expiresIn: 5 * 60 });
}
