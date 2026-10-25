#!/usr/bin/env bash
# REAL-PROCESS CODE-SWITCH DRILL: the recovery route, exercised for real.
# One disposable file DB + rowVersion barrier installed. Candidate build boots,
# writes (create/edit/new entry). Process killed. ROLLBACK build (worktree)
# boots on the SAME database: every intervening entry/edit must be visible and
# operation continues (edit/new entry/deletion land under the barrier).
# Rollback killed. Candidate boots again: all rollback-era changes present.
# Pass = no 5xx, no lost entries, deletions stick, all rows stay stamped.
# Usage: bash scripts/drill-code-switch.sh [rollback-worktree-path]
set -u
CANDIDATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROLLBACK_DIR="${1:-/tmp/oncehere-rollback}"
DB=/tmp/drill-switch-$$.db
LOGC=/tmp/drill-switch-candidate-$$.log
LOGR=/tmp/drill-switch-rollback-$$.log
LOGC2=/tmp/drill-switch-candidate2-$$.log
PC=$((4200 + $$ % 300)); PR=$((4500 + $$ % 300)); PC2=$((4800 + $$ % 300))
rm -f "$DB"*

node -e "
const {createClient} = require('$CANDIDATE_DIR/node_modules/@libsql/client');
const fs = require('fs');
(async () => {
  const c = createClient({url: 'file:$DB'});
  await c.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
  const raw = fs.readFileSync('$CANDIDATE_DIR/db/rowversion-barrier.sql', 'utf8');
  const stmts = raw.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n').split(/END;\s*/).map(s => s.trim()).filter(Boolean).map(s => s + 'END;');
  for (const s of stmts) await c.execute(s);
  await c.close();
})()
" || { echo "FAIL barrier install"; exit 1; }

boot() { # dir port log
  (cd "$1" && TURSO_DATABASE_URL="file:$DB" TURSO_AUTH_TOKEN=drill NODE_ENV=production PORT=$2 \
    setsid npx tsx server.ts > "$3" 2>&1 &) 
  for i in $(seq 1 45); do
    sleep 2
    curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$2/api/archives/demo-marys-2025" && return 0
  done
  echo "FAIL boot $1:$2"; tail -5 "$3"; exit 1
}
killport() { pkill -9 -f "tsx server.ts" 2>/dev/null; sleep 1; }
trap 'killport; rm -f "$DB"*' EXIT

# --- leg 1: CANDIDATE writes ---
boot "$CANDIDATE_DIR" $PC "$LOGC"
B="http://127.0.0.1:$PC/api"
CREATE=$(curl -s --max-time 15 -X POST "$B/archives" -H "Content-Type: application/json" \
  -d '{"archiveType":"school","title":"Switch Archive","organizationName":"Switch Org","startYear":2024,"endYear":2026,"themeId":"midnight-cinema","visibility":"public","contributionMode":"owner-only","recoveryKey":"switch-key-0000-1111"}' -w '\n%{http_code}')
[ "$(echo "$CREATE" | tail -1)" = "201" ] || { echo "FAIL create"; exit 1; }
ID=$(echo "$CREATE" | head -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['archive']['id'])")
SV=$(echo "$CREATE" | head -1 | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('saveVersion') or d['archive'].get('saveVersion') or '')")
TOK=$(curl -s --max-time 15 -X POST "$B/archives/auth/key-access" -H "Content-Type: application/json" -d '{"key":"switch-key-0000-1111"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$SV" ] || SV=$(curl -s --max-time 15 "$B/archives/$ID" -H "Authorization: Bearer $TOK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('saveVersion') or d.get('archive',{}).get('saveVersion') or '')")
[ -n "$SV" ] || { echo "FAIL no saveVersion obtainable"; exit 1; }
C1=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X PATCH "$B/archives/$ID" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d "{\"title\":\"candidate-edit\",\"baseVersion\":\"$SV\"}")
C2=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X POST "$B/archives/$ID/timeline" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"title":"event-candidate-era","description":"candidate wrote this","yearLabel":"2025"}')
[ "$C1" = "200" ] && [ "$C2" = "201" ] || { echo "FAIL candidate writes patch=$C1 post=$C2"; exit 1; }
killport

# --- leg 2: ROLLBACK build boots on the same DB, intervening data retained, operates ---
boot "$ROLLBACK_DIR" $PR "$LOGR"
B="http://127.0.0.1:$PR/api"
TOK2=$(curl -s --max-time 15 -X POST "$B/archives/auth/key-access" -H "Content-Type: application/json" -d '{"key":"switch-key-0000-1111"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$TOK2" ] || { echo "FAIL rollback key-access (session continuity)"; exit 1; }
READ=$(curl -s --max-time 15 "$B/archives/$ID" -H "Authorization: Bearer $TOK2")
TITLE=$(echo "$READ" | python3 -c "import sys,json;print(json.load(sys.stdin).get('archive',{}).get('title'))")
[ "$TITLE" = "candidate-edit" ] || { echo "FAIL rollback reads candidate data: $TITLE"; exit 1; }
R1=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X PATCH "$B/archives/$ID" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK2" -d '{"title":"rollback-edit"}')
R2=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X POST "$B/archives/$ID/timeline" -H "Content-Type: application/json" -H "Authorization: Bearer $TOK2" -d '{"title":"event-rollback-era","description":"rollback wrote this","yearLabel":"2026"}')
[ "$R1" = "200" ] && [ "$R2" = "201" ] || { echo "FAIL rollback writes patch=$R1 post=$R2"; exit 1; }
# deletion: remove the candidate-era event under the rollback build
EVID=$(curl -s --max-time 15 "$B/archives/$ID" -H "Authorization: Bearer $TOK2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
evs=d.get('timeline') or d.get('timelineEvents') or []
print(next((e['id'] for e in evs if e.get('title')=='event-candidate-era'), ''))")
[ -n "$EVID" ] || { echo "FAIL locate candidate-era event"; exit 1; }
R3=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X DELETE "$B/archives/$ID/timeline/$EVID" -H "Authorization: Bearer $TOK2")
[ "$R3" = "200" ] || { echo "FAIL rollback delete=$R3"; exit 1; }
killport

# --- leg 3: CANDIDATE boots again: everything retained ---
boot "$CANDIDATE_DIR" $PC2 "$LOGC2"
B="http://127.0.0.1:$PC2/api"
TOK3=$(curl -s --max-time 15 -X POST "$B/archives/auth/key-access" -H "Content-Type: application/json" -d '{"key":"switch-key-0000-1111"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
FINAL=$(curl -s --max-time 15 "$B/archives/$ID" -H "Authorization: Bearer $TOK3")
echo "$FINAL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
a=d.get('archive',{})
evs=d.get('timeline') or a.get('timelineEvents') or []
titles=[e.get('title') for e in evs]
assert a.get('title')=='rollback-edit', f'title={a.get(\"title\")}'
assert 'event-rollback-era' in titles, f'missing rollback-era event: {titles}'
assert 'event-candidate-era' not in titles, f'deletion did not stick: {titles}'
print('verified: title=rollback-edit, rollback-era event present, candidate-era deletion stuck')
" || { echo "FAIL final verification"; exit 1; }
STAMPED=$(node -e "
const {createClient} = require('$CANDIDATE_DIR/node_modules/@libsql/client');
(async () => {
  const c = createClient({url: 'file:$DB'});
  const r = await c.execute(\"SELECT count(*) n FROM oncehere_state WHERE data NOT LIKE '%rowVersion%'\");
  console.log(r.rows[0].n); await c.close();
})()")
[ "$STAMPED" = "0" ] || { echo "FAIL unstamped rows: $STAMPED"; exit 1; }
echo "PASS: candidate->rollback->candidate, all intervening data retained, deletion stuck, rows stamped"
