# Cloudflare R2 setup for OnceHere

Cloudflare R2 can be used as OnceHere's private S3-compatible media store. OnceHere signs upload requests on the server and the browser sends media bytes directly to the bucket; R2 credentials are never sent to the browser.

## 1. Create a private bucket

Create a bucket such as `oncehere-media`. Keep it private; do not enable public development access for production media.

## 2. Create restricted credentials

Create an R2 API token with Object Read & Write access restricted to the OnceHere bucket. Save the Access Key ID and Secret Access Key securely.

## 3. Configure the hosting environment

Set these server-only variables:

```text
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=oncehere-media
```

Do not prefix any storage credential with `VITE_`.

If the generic `OBJECT_STORAGE_*` variables are also configured, OnceHere intentionally uses those instead of the Cloudflare-specific `R2_*` values.

## 4. CORS

Browser uploads require `PUT` from the actual OnceHere production origin. The application attempts to configure GET/HEAD/PUT CORS for its known production/secondary origins using the configured storage credentials. If a provider-side permission prevents that automatic update, configure the equivalent bucket CORS rule manually.

CORS does not make the bucket public. OnceHere keeps the storage bucket private and gates media access through archive/session checks.

## 5. Verify the live integration

After changing storage credentials or CORS:

1. Check `/api/storage-status` and require `connected: true`.
2. Upload an image and a small video in a temporary owner archive.
3. Save and refresh; confirm both still render.
4. Delete the temporary media and verify it stays deleted.
5. Inspect production runtime logs for CORS/storage errors.

## Current application limits

- Source image: 10 MB maximum.
- Source video: 20 MB maximum.
- Media Vault: 100 total attachments, at most 5 videos.
- Journey: 20 media attachments, at most 3 videos.
- Yearbook: 250 uploaded portrait allowance.
- Memory Wall: 5 image-attached Memory Notes; videos are not allowed there; text-only notes can continue.
- Shared uploaded-media ceiling: 500 MB per archive.

Large non-GIF images are browser-optimized toward approximately 1.25 MB and a maximum 2048 px dimension when compression reduces the file size. See [CURRENT_LIMITS.md](CURRENT_LIMITS.md) for the complete current rules.
