# OnceHere current limits

Last aligned with production code: 17 September 2026.

This file describes the limits enforced by the current application. The server-side enforcement source of truth for uploaded media is `server/r2.ts` (`R2_LIMITS`). If this document and the server ever disagree, the server wins.

## Media and archive limits

| Area | Current enforced limit |
| --- | --- |
| Source image file | 10 MB maximum |
| Source video file | 59 MB maximum |
| Media Vault | 100 total attachments, including at most 5 videos |
| Journey | 20 media attachments, including at most 3 videos |
| Archive-wide video total | 5 videos maximum across Media Vault + Journey combined |
| Yearbook | 250 uploaded portrait allowance |
| Memory Notes / Memory Wall | 5 image-attached notes; videos are not allowed; text-only notes can continue after the image limit |
| Shared uploaded-media storage | 500 MB maximum physical object-storage usage per archive |
| Memory Note text | 500 characters |

The section allowances are independent except for videos: Media Vault can contain up to 5 videos and Journey up to 3, but an archive may contain only 5 videos across those two sections combined. All uploaded objects also share the same 500 MB physical-media ceiling. Count limits therefore do not guarantee that every slot can be filled with a maximum-size file.

With no videos, the listed media/portrait/image-attachment allowances total 375 slots (250 Yearbook + 20 Journey + 100 Vault + 5 Wall). The 500 MB physical storage ceiling normally becomes the practical limit before all slots can contain very large files.

### Image optimization

OnceHere accepts source images up to 10 MB. Non-GIF images that benefit from optimization are resized to a maximum dimension of 2048 px and browser-compressed toward approximately 1.25 MB as high-quality WebP. If re-encoding would make the file larger, the original is kept. Animated GIFs are kept as supplied. Videos are not transcoded by OnceHere.

### Video uploads

Videos up to 59 MB are uploaded directly from the browser to private S3-compatible object storage through a short-lived signed PUT URL. They do not pass through Vercel/Render API JSON. The uploader reports progress and uses an inactivity timeout rather than a tiny fixed total-request timeout. Videos are currently not transcoded or resumable, so keeping the original file locally remains important if a connection is interrupted.

### Direct media URLs

Direct external image/video file URLs can be attached where the UI allows them. They still count against the relevant section attachment and archive-wide video counts, but their bytes are hosted externally and therefore do not consume OnceHere object-storage bytes. Ordinary YouTube, Instagram, TikTok, Facebook, X/Twitter page URLs are not direct media files and are rejected by the uploader.

## Archive count

There is no hard-coded global maximum number of archives in the archive-creation endpoint. The practical platform capacity is determined by the configured database plan, object-storage plan, hosting/function usage, visitor traffic, and the average size of each archive.

A media-heavy archive can consume up to 500 MB of object storage. A mostly text/external-URL archive can consume very little object storage. Do not quote one universal archive-count capacity without also stating the storage and traffic assumptions.

## Access and session limits

- Owner recovery-key verification: 5 failed attempts per IP in a 15-minute window before temporary rate limiting.
- Contributor/editor PIN: lockout after 5 failed attempts for 15 minutes.
- Owner session lifetime: 30 days.
- Contributor/editor session lifetime: 2 hours.
- Viewer session lifetime: 24 hours.
- The Owner Master Recovery Key is permanent and is not rotatable through the API. The server stores its bcrypt hash, not the plaintext key.
- After an owner successfully unlocks with the recovery key, the exact entered key is retained only in that browser tab's session storage so it can be revealed, copied, or downloaded as a backup. Contributor/editor PIN users do not receive the owner recovery key.

Because only a hash is persisted on the server, a recovery key that is truly lost everywhere cannot be reconstructed by the server. Owners should download the backup file after creating or recovering an archive.

## Request and upload architecture

API JSON requests are capped at 2 MB. Media files are not sent through that JSON body: the browser requests a short-lived signed upload URL and uploads the bytes directly to private S3-compatible object storage. Signed upload URLs expire after 10 minutes; signed download URLs expire after 5 minutes.

Supported uploaded types currently include JPG/JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, and MOV/QuickTime.

## Hosting/provider limits

Provider quotas are not hard-coded application limits and can change independently. Production currently uses Vercel for the web/API deployment, Turso-compatible durable database configuration, and connected private S3-compatible object storage. Check the actual provider dashboards and current plan documentation before making a public capacity promise.
