# OnceHere retry: changes and verification

Date: 4 September 2026. This is a tested repair candidate, not a complete production certification. No live deployment was performed.

## Security follow-up — 4 September 2026

Implemented additional fixes in the active `server/` source:

- Central tenant visibility checks protect sections, timeline, members, media, wall and nested resources. Anonymous and other-tenant sessions cannot retrieve private/draft content through these endpoints.
- Viewer sessions are read-only. Existing contributor sessions cannot mutate owner-only archives; open contributors cannot use PUT/PATCH/DELETE to modify existing content.
- Drafts cannot leak through slug lookup. Locked private responses expose only a minimal archive descriptor.
- Public member-message responses exclude private and hidden messages. Recipient-specific private-message access still needs an authenticated recipient identity design; this patch does not invent one.
- Signed tokens now require an unexpired server session record and matching archive/role. Deleted archives reject sessions and recovery. Removed the unsigned cached-session fallbacks.
- New tokens contain a cryptographically random nonce, so issuing a second session does not recreate an earlier revoked token.
- Owner-only archives reject contributor PIN authentication even when an old PIN hash remains configured.

Regression coverage adds five independent iterations of the private-resource permission matrix, viewer mutation rejection, revoked/deleted session rejection, independent session issuance, owner-only PIN rejection, deleted recovery rejection, draft slug protection and private/hidden message filtering. Persistence is stubbed: these tests do not read or write live Supabase data.

The supported browser API was inspected again: it provides no viewport resizing/device-emulation capability. Therefore no additional mobile viewport or full browser E2E pass is claimed in this follow-up. The 9-size matrix and authenticated browser upload/crop/admin flows remain unverified. Completing them requires an isolated staging environment plus a mobile-capable test runner. A complete security sign-off also remains blocked by the sessionStorage bearer design, snapshot persistence, media validation/storage and AI remote-fetch concerns listed below. Do not deploy on the basis of this partial security repair.

## Yearbook-member-count repair — 4 September 2026

- Archive-wide save now accepts and validates `approxPeopleCount`, so editing and saving an archive does not silently discard the planned yearbook size.
- Public/editor responses preserve that saved number until individual member profiles exist. Once profiles are added, the displayed count becomes the real profile total.
- New regression coverage creates, recovers, reloads and updates draft archives with 30, 31, 40 and 100 members. It also rejects zero. Existing archives are not reset, recreated or removed by this change; the application continues loading the persisted archive snapshot before serving requests.

## Changes

- AI no longer returns canned captions when its key, image fetch, provider request or response fails. Errors are visible and preserve the previous caption. Rewrite context includes the current draft and recent suggestions; exact repeats and stale responses are rejected. Automatic AI upload analysis is now opt-in.
- The Node server now loads `.env.local` and `.env`, matching the setup instructions. Host environment variables take precedence. `GEMINI_API_KEY` is server-only; `GEMINI_MODEL` can override the model.
- Timeline images have explicit container sizing and no hidden-until-scroll gate. Horizontal navigation centers the selected milestone. Timeline and vault full-screen viewers render direct videos as video elements.
- Image selection includes a preview/crop action. Square, landscape and portrait crops, zoom, reposition, Apply, Cancel and Escape are supported. Cropping changes the selected copy, not the original device file. Removing a selection cancels its pending file read.
- The floating Explore/share control is now a small translucent icon, draggable within bounds, with full visibility on hover/focus. The menu can be closed without changing content.
- Sample recovery-key help is restored and clearly labeled fictional-demo-only. Owner recovery remains separate from contributor/viewer PINs. Recovery requests time out visibly and have server-side attempt limits.
- Removed the known fallback session-signing secret. Configure a stable random `SESSION_SECRET` in production; local fallback is process-random. The example configuration no longer provides usable shared admin/session keys.
- New archives default to hidden from Explore. Admin Unhide never changes deployment status or privacy. Admin preview is read-only, has a properly bounded scroll container, bypasses hidden reveal states, uses current server wall data, and offers Refresh preview. The archive list refreshes every 30 seconds while the tab is visible without overwriting unsaved contact-setting edits.
- Access-history responses now require the owner of that same archive.
- Existing OnceHere branding and attribution links remain unchanged. A source search found no remaining `MemoryCanvas` or `Memory Canvas` references outside dependencies/build output.

## Verification actually completed

- `npm run lint`: TypeScript check passed.
- `npm test`: 39 tests across four files passed. These include five security permission-matrix iterations, five independent archive creation/recovery/admin-preview/privacy scenarios and five mocked AI rewrite-instruction scenarios. Provider errors, missing configuration and malformed AI responses are tested. These are not five complete browser end-to-end runs.
- `npm run build`: client and Node server production builds passed. The client bundle remains approximately 835 KB minified / 222 KB gzip, and CSS approximately 185 KB / 23 KB gzip. Vite reports a large-chunk warning.
- Browser: landing page and demo selector opened; Mary's archive loaded. All five timeline images were observed loaded with nonzero dimensions; the second/third/fourth/fifth were explicitly inspected. The floating menu opened and closed. An attempted five-cycle menu test hit a browser protocol timeout after opening; it is not reported as passed.
- Browser console included development-preview WebSocket connection errors and an extension metadata error. No claim of a clean production console is made.

## Still required before production release

1. **150 MB video upload is not implemented.** Current direct uploads use base64 in JSON and the archive-state snapshot. The interface enforces 18 MB video / 15 MB image limits for this method. Raising the JSON limit is not a safe solution. Implement dedicated private object storage, signed/resumable binary uploads, MIME inspection, thumbnail/poster generation and authenticated media reads, then test the full 150 MB boundary and failure/retry paths.
2. **Live AI quality is unverified.** Tests mock the provider. Configure a valid server key and test diverse real images plus repeated rewrite requests, quotas and provider timeouts. Remote-image fetching also needs a dedicated SSRF/size-limit security review before broad untrusted production use.
3. **Persistence is not a full multi-tenant transactional database implementation.** Existing code stores maps as one Supabase JSON snapshot. Concurrent servers, large data, failed-write rollback and migrations need work. No production storage write/restart test was run.
4. **Security audit remains incomplete.** Existing bearer/session-storage authentication is not the full HTTP-only-cookie/CSRF design from the specification. Review all mutations, revocation, moderation, rate limiting and tenant isolation. Do not treat the targeted fixes as a full security certification.
5. **Browser coverage remains incomplete.** Crop output, real upload completion, admin modal interaction, horizontal timeline after uploads, all responsive sizes, all themes, keyboard-only flows and every button state still need repeated end-to-end tests. No real 14.8 MB or 150 MB upload was performed.
6. **Performance and demo completeness remain unverified.** Core Web Vitals were not measured. The existing demos contain fewer assets than the full requested collection; this repair does not certify the original complete-platform specification.

## Deployment gate

Keep the current live deployment unchanged until the blocking storage/security work and production acceptance tests pass. Apply changes to the active `src/` and `server/` trees; duplicate top-level component files were supplied in the original project and are not the active Vite application source. Do not copy an old top-level duplicate over a repaired component.
