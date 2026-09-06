# Cloudflare R2 setup for OnceHere

OnceHere uploads Memory Vault files directly from the visitor's browser to R2. R2 credentials remain on the server and are never sent to the browser.

## 1. Create the bucket

In Cloudflare Dashboard, open **R2 Object Storage** and create a bucket named `oncehere-media`. Keep the bucket private; do not enable public development access. OnceHere generates short-lived viewing links after checking archive visibility.

## 2. Configure bucket CORS

Replace the example origin with the exact Render site origin (no trailing slash):

```json
[
  {
    "AllowedOrigins": [
      "https://oncehere-the-forever-home-of-memories.onrender.com"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add `http://localhost:3000` as another allowed origin only while testing locally.

## 3. Create an R2 API token

Create an R2 API token with **Object Read & Write** access restricted to the `oncehere-media` bucket. Save its Access Key ID and Secret Access Key immediately; Cloudflare shows the secret once.

## 4. Add Render environment variables

Add these exact server-side environment variable names in Render:

```text
R2_ACCOUNT_ID=your Cloudflare account ID
R2_ACCESS_KEY_ID=your R2 access key ID
R2_SECRET_ACCESS_KEY=your R2 secret access key
R2_BUCKET_NAME=oncehere-media
```

Do not prefix any R2 variable with `VITE_`, and never put these credentials in frontend code.

## 5. Deploy and test

Redeploy the current commit. In one temporary archive, upload one small JPG and one small MP4, refresh the page, and verify both still load. Then delete them and verify they disappear. Do not launch until this test passes.

## Enforced limits

- 15 MB per image
- 59 MB per video
- 50 images per archive
- 2 videos per archive
- 200 MB tracked R2 media per archive

Existing external URLs and existing archive records are not migrated or deleted by this change.
