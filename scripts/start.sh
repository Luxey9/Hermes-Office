#!/bin/bash
# Start Hermes Office (collector + frontend) detached.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${HERMES_OFFICE_PORT:-3456}"
LOG="$DIR/office.log"
PIDFILE="$DIR/.collector.pid"

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null \
     && tr '\0' ' ' < "/proc/$PID/cmdline" 2>/dev/null | grep -q "collector.mjs"; then
    echo "Hermes Office sudah jalan (pid $PID)."
    exit 0
  fi
  rm -f "$PIDFILE"
fi

cd "$DIR"
nohup node server/collector.mjs >> "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
disown 2>/dev/null
echo "Hermes Office jalan di http://127.0.0.1:$PORT (pid $(cat "$PIDFILE"), log: $LOG)"
