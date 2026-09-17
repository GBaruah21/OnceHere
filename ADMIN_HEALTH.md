# OnceHere Admin Health

The private Owner Tools page includes a System health & capacity panel backed by `GET /api/admin/health`.

## Access

The endpoint uses the same `PLATFORM_ADMIN_KEY` header protection as the existing platform-owner archive tools. It is not a public status endpoint and does not expose provider credentials, object keys, PIN hashes, recovery keys, or database tokens.

## Live checks

The panel reports:

- deployment provider, environment, and build commit;
- Turso configuration and archive-index readiness;
- session-signing readiness;
- object-storage configuration and live connectivity;
- object-storage provider, OnceHere media bytes and object count;
- storage-reference usage and remaining capacity when a reference budget is available;
- active archive counts by publication and visibility state;
- current product media/attachment limits;
- report/feedback channel configuration;
- deterministic operational issues such as disconnected storage or missing required configuration.

Storage scans are cached briefly so refreshing the owner page does not repeatedly list the entire bucket.

## Storage reference

`OBJECT_STORAGE_BUDGET_BYTES` may be set to the planning budget that should appear in the dashboard.

When the configured endpoint is Backblaze B2 and no explicit budget is set, the dashboard uses the provider's 10 GB free-storage allowance as a **reference only**. Backblaze applies that allowance account-wide, while OnceHere measures only the configured bucket's `archives/` objects. The UI states this limitation explicitly.

## Runtime errors

OnceHere does not copy Vercel or Render runtime logs into its own database. The dashboard therefore does not invent a historical error count. It shows live dependency/configuration/capacity problems and tells the owner that historical function/runtime errors remain in the hosting provider logs.
