-- rowVersion write barrier for oncehere_state (Turso / libSQL)
-- ---------------------------------------------------------------------------
-- PURPOSE
--   During and after a deployment that introduces rowVersion-stamped rows,
--   pre-barrier server code (any build whose tenantStorageRow/tenantIndexSnapshot
--   does not emit `rowVersion`) must no longer be able to overwrite a stamped
--   row. Its writes are unconditional upserts; without this barrier a write
--   from an old instance that is still in flight at cutover lands after the
--   new deployment's write and silently reverts it. The barrier moves that
--   decision into the database, the only layer both writers must pass through,
--   so it does not depend on deploy timing, function timeouts, or traffic
--   being quiet.
--
-- RULE
--   Once a row's data envelope carries `rowVersion`, every later write must
--   present a DIFFERENT `rowVersion`. Current code mints a fresh
--   `<iso>#<uuid>` per row build; pre-barrier code mints none, so its writes
--   fail closed with SQLITE_CONSTRAINT_TRIGGER and its caller sees an honest
--   error instead of a silent lost update.
--
-- WHAT THIS IS NOT
--   - This is NOT a stale-write compare-and-swap. It only discriminates
--     writer class (barrier-aware vs not). Ordering among barrier-aware
--     writers comes from the application CAS (conditionalTenantWrite), and
--     the first-write-after-cutover ordering also relies on that CAS. Both
--     layers are required.
--   - Pristine pre-barrier code cannot write under this barrier (its writes
--     fail closed). The PROTECTED ROLLBACK route is branch
--     exp/rollback-hotfix-2026-10-25: pre-barrier behavior plus a fresh
--     rowVersion per row build, so rollback keeps every write
--     barrier-passing and the guards are NEVER dropped. Do not drop these
--     triggers as a "rollback step": that removes the protection while
--     unprotected writers are live.
--   - Restore is engineered in db/protected-restore.mjs: upsert-only, fresh
--     rowVersion minted per attempt, per-row verify, stop-on-first-failure.
--     A verbatim replay of a row's CURRENT rowVersion is rejected by design;
--     delete+reinsert restore shapes are rejected by guard 2. Both are
--     covered by tests/protected-rollback-restore.test.ts.
--
-- INSTALL / REMOVE
--   Install: run this file against the production database ONCE, any time
--   BEFORE cutover. While only pre-barrier code runs, every production row
--   is unstamped and all three guards are inert (verified by tests/
--   rowversion-barrier.test.ts). Requires a production write credential;
--   the read-only reporting token cannot install it.
--   Remove: only as a deliberate, separately approved operation once no
--   pre-barrier deployment can serve traffic:
--     DROP TRIGGER IF EXISTS rv_guard_insert;
--     DROP TRIGGER IF EXISTS rv_guard_update;
--     DROP TRIGGER IF EXISTS rv_guard_delete;
--
-- VERIFIED WRITER SQL SHAPES AT TIME OF WRITING (server/db.ts):
--   pre-barrier: INSERT ... ON CONFLICT(id) DO UPDATE (batched tenant+index);
--   barrier-aware: same upsert, INSERT OR IGNORE, UPDATE ... WHERE id AND
--   updated_at, DELETE ... WHERE id AND updated_at (rate-limit rows only).
--   No writer uses INSERT OR REPLACE or hard-deletes tenant rows; guard 3 and
--   guard 2 keep those shapes from bypassing the barrier if that ever changes.
-- ---------------------------------------------------------------------------

-- Guard 1 (UPDATE): reject stale or unversioned overwrites of a stamped row.
CREATE TRIGGER IF NOT EXISTS rv_guard_update BEFORE UPDATE ON oncehere_state
WHEN json_extract(OLD.data, '$.rowVersion') IS NOT NULL
  AND (json_extract(NEW.data, '$.rowVersion') IS NULL
       OR json_extract(NEW.data, '$.rowVersion') = json_extract(OLD.data, '$.rowVersion'))
BEGIN
  SELECT RAISE(ABORT, 'rowVersion barrier: stale or unversioned write rejected');
END;

-- Guard 2 (DELETE): never delete a stamped row (blocks delete+reinsert bypass).
CREATE TRIGGER IF NOT EXISTS rv_guard_delete BEFORE DELETE ON oncehere_state
WHEN json_extract(OLD.data, '$.rowVersion') IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'rowVersion barrier: deletion of versioned row rejected');
END;

-- Guard 3 (INSERT): INSERT OR REPLACE skips UPDATE/DELETE triggers, so catch
-- replacement of an existing stamped row here. Plain INSERTs of new ids and
-- INSERT OR IGNORE with a fresh rowVersion pass the WHEN clause unchanged.
CREATE TRIGGER IF NOT EXISTS rv_guard_insert BEFORE INSERT ON oncehere_state
WHEN EXISTS (SELECT 1 FROM oncehere_state e
             WHERE e.id = NEW.id AND json_extract(e.data, '$.rowVersion') IS NOT NULL)
  AND (json_extract(NEW.data, '$.rowVersion') IS NULL
       OR json_extract(NEW.data, '$.rowVersion')
          = (SELECT json_extract(e2.data, '$.rowVersion') FROM oncehere_state e2 WHERE e2.id = NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'rowVersion barrier: replace of versioned row rejected');
END;
