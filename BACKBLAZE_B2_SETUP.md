# Backblaze B2 setup for OnceHere

This is the supported alternative when a Cloudflare account cannot be activated. The bucket stays private. OnceHere uploads directly with short-lived signed URLs and checks archive visibility before issuing short-lived viewing URLs.

## 1. Create the account and bucket

1. Create a Backblaze account using Google sign-in if normal email verification is failing.
2. Open **B2 Cloud Storage** and create a **Private** bucket named `oncehere-media`.
3. Record the bucket's S3 endpoint and region shown by Backblaze. An endpoint resembles `https://s3.us-west-004.backblazeb2.com`; use the value shown in your own account.

## 2. Create credentials

Create an Application Key restricted to the `oncehere-media` bucket with read and write access. Save both `keyID` and `applicationKey` when they are shown. The application key is displayed only once.

## 3. Configure CORS

Apply a CORS rule to the bucket allowing the exact production origin:

```json
[
  {
    "corsRuleName": "oncehere-browser-uploads",
    "allowedOrigins": ["https://oncehere-the-forever-home-of-memories.onrender.com"],
    "allowedHeaders": ["*"],
    "allowedOperations": ["s3_put"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]
```

Use Backblaze's bucket CORS editor or CLI. Do not make the bucket public.

## 4. Add Render environment variables

```text
OBJECT_STORAGE_ENDPOINT=https://the-exact-s3-endpoint-shown-by-backblaze
OBJECT_STORAGE_REGION=the-region-inside-that-endpoint
OBJECT_STORAGE_ACCESS_KEY_ID=your-Backblaze-keyID
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-Backblaze-applicationKey
OBJECT_STORAGE_BUCKET=oncehere-media
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

Never prefix secrets with `VITE_`. Keep the existing Supabase and session variables unchanged.

## 5. Verify before launch

Redeploy, create a temporary archive, upload a JPG and an MP4, refresh, and confirm both still load. Delete both and confirm they disappear. A provider account existing is not proof that the integration works; this full upload/read/delete test is required.

OnceHere accepts source images up to 10 MB and optimizes large images to high-quality WebP in the browser before uploading. Videos are limited to 20 MB and are preserved as supplied. Each archive has a 100 MB media allowance, with a maximum of 50 images and 2 videos.
