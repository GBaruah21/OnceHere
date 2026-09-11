import crypto from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

export async function createUploadUrl(key: string, contentType: string, _size: number): Promise<string> {
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

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

export async function createDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucketName(),
    Key: key
  }), { expiresIn: 5 * 60 });
}
