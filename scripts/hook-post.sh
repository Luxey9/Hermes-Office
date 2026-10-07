#!/usr/bin/env bash
# Hermes Office — post_tool_call wrapper: teruskan semua event ke collector,
# tapi tandai yang error sehingga dashboard menampilkan banner merah otomatis.
# Windows-safe: curl.exe Windows tidak paham path /tmp MSYS, jadi body
# dikirim via --data-binary @- (stdin pipe), bukan -d @file.
COLLECTOR="${HERMES_OFFICE_URL:-http://127.0.0.1:3456/hook}"
BODY="$(cat)"
# Deteksi error: status error/cancelled/timeout, error_type/error_message terisi,
# atau result berisi {"error": "...} yang bukan null
IS_ERR=0
echo "$BODY" | grep -q -i -E '"status"[[:space:]]*:[[:space:]]*"(error|cancelled|timeout|failed)"' && IS_ERR=1
echo "$BODY" | grep -q -E '"error_type"[[:space:]]*:[[:space:]]*"[^"]+"' && IS_ERR=1
echo "$BODY" | grep -q -E '"error_message"[[:space:]]*:[[:space:]]*"[^"]+"' && IS_ERR=1
echo "$BODY" | grep -q -E '\\"error\\"[[:space:]]*:[[:space:]]*\\"[^"]' && IS_ERR=1
if [ "$IS_ERR" = "1" ]; then
  OUT="$(echo "$BODY" | sed -E 's/"hook_event_name"[[:space:]]*:[[:space:]]*"[^"]+"/"hook_event_name": "tool_error"/')"
  printf '%s' "$OUT" | curl -s -m 5 -X POST "$COLLECTOR" -H "Content-Type: application/json" --data-binary @-
else
  printf '%s' "$BODY" | curl -s -m 5 -X POST "$COLLECTOR" -H "Content-Type: application/json" --data-binary @-
fi
