#!/usr/bin/env bash
# REAL-PROCESS REGRESSION: ordinary sequential owner flow must never self-conflict.
# Found 2026-10-25 by the code-switch drill: create -> key-access -> PATCH 409d
# PERSISTENTLY on the candidate build (root cause: the non-blocking session/
# activity index write races the PATCH's queued tenant+index flush; the loser
# keeps a stale index base and every later write 409s - no re-base).
# Usage: bash scripts/drill-sequential-owner-flow.sh  (expects: node_modules, tsx)
# Pass criteria: create 201, key-access 200, patch 200 (NOT 409), post 201,
# final GET shows the patched title. Fail closed otherwise.
set -u
DB=/tmp/drill-seq-$$.db
PORT=41$$
LOG=/tmp/drill-seq-$$.log
rm -f "$DB"*
TURSO_DATABASE_URL="file:$DB" TURSO_AUTH_TOKEN=drill NODE_ENV=production PORT=$PORT \
  npx tsx server.ts > "$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -f "$DB"*' EXIT
for i in $(seq 1 45); do
  sleep 2
  curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$PORT/api/archives/demo-marys-2025" && break
done
B="http://127.0.0.1:$PORT/api"
CREATE=$(curl -s --max-time 15 -X POST "$B/archives" -H "Content-Type: application/json" \
  -d '{"archiveType":"school","title":"Drill Archive","organizationName":"Drill Org","startYear":2024,"endYear":2026,"themeId":"midnight-cinema","visibility":"public","contributionMode":"owner-only","recoveryKey":"drill-key-0000-1111-2222"}' -w '\n%{http_code}')
CODE=$(echo "$CREATE" | tail -1); [ "$CODE" = "201" ] || { echo "FAIL create=$CODE"; exit 1; }
ID=$(echo "$CREATE" | head -1 | python3 -c "import sys,json;print(json.load(sys.stdin)['archive']['id'])")
TOK=$(curl -s --max-time 15 -X POST "$B/archives/auth/key-access" -H "Content-Type: application/json" \
  -d '{"key":"drill-key-0000-1111-2222"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
[ -n "$TOK" ] || { echo "FAIL key-access"; exit 1; }
PATCH=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X PATCH "$B/archives/$ID" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d '{"title":"candidate-edit-1"}')
[ "$PATCH" = "200" ] || { echo "FAIL patch=$PATCH (SEQUENTIAL SELF-CONFLICT)"; exit 1; }
POST=$(curl -s -o /dev/null --max-time 15 -w "%{http_code}" -X POST "$B/archives/$ID/timeline" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" \
  -d '{"title":"event-A","description":"sequential flow","yearLabel":"2025"}')
[ "$POST" = "201" ] || { echo "FAIL post=$POST"; exit 1; }
TITLE=$(curl -s --max-time 15 "$B/archives/$ID" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('title') or d.get('archive',{}).get('title'))")
[ "$TITLE" = "candidate-edit-1" ] || { echo "FAIL final title=$TITLE"; exit 1; }
echo "PASS: create=201 key-access=200 patch=200 post=201 title=verified"
