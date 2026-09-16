# Backblaze B2 setup for OnceHere

Backblaze B2 can be used through its S3-compatible API as OnceHere's private object-storage provider. The browser uploads directly with short-lived signed PUT URLs; storage credentials remain server-side.

## 1. Create a private bucket

Create a private B2 bucket (for example `oncehere-media`) and note the S3 endpoint and region shown for that bucket. Do not make the bucket public.

## 2. Create restricted credentials

Create an Application Key restricted to the OnceHere bucket with the permissions required for object read/write/delete and bucket listing. Save the key ID and application key securely; the secret is not a frontend value.

## 3. Configure the hosting environment

Set the S3-compatible server variables on the host:

```text
OBJECT_STORAGE_ENDPOINT=https://the-exact-s3-endpoint-shown-by-backblaze
OBJECT_STORAGE_REGION=the-region-inside-that-endpoint
OBJECT_STORAGE_ACCESS_KEY_ID=your-Backblaze-keyID
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-Backblaze-applicationKey
OBJECT_STORAGE_BUCKET=oncehere-media
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

When `OBJECT_STORAGE_*` is configured, OnceHere uses it instead of the Cloudflare-specific `R2_*` variables. Never prefix object-storage credentials with `VITE_`.

## 4. CORS

Browser uploads require the bucket to permit `PUT` from the actual OnceHere origins. The application also attempts to apply its current allowed-origin policy programmatically with the configured S3 credentials. Keep production origins current if domains change.

The bucket must remain private; CORS permission does not make stored objects public. OnceHere serves protected objects only after archive/session checks and uses signed storage operations internally.

## 5. Verify the live integration

After changing storage credentials or CORS:

1. Check `/api/storage-status` and require `connected: true`.
2. In a temporary owner archive, upload an image and a small video.
3. Save, refresh, and verify both load again.
4. Delete them and verify they do not return.
5. Inspect production runtime logs for storage/CORS failures.

A provider account existing is not proof that uploads, protected reads, and deletes all work.

## Current application limits

- Source image: 10 MB maximum.
- Source video: 20 MB maximum.
- Media Vault: 100 attachments, at most 5 videos.
- Journey: 20 media attachments, at most 3 videos.
- Yearbook: 250 uploaded portrait allowance.
- Memory Wall: 5 image-attached Memory Notes; videos are not allowed there; text-only notes can continue.
- Shared uploaded-media ceiling: 500 MB per archive.

Large non-GIF images are browser-optimized toward approximately 1.25 MB and a maximum 2048 px dimension when compression reduces the file size. See [CURRENT_LIMITS.md](CURRENT_LIMITS.md) for the complete current rules.
