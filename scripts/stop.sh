#!/bin/bash
# Stop Hermes Office.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$DIR/.collector.pid"

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    sleep 1
    kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null
    echo "Hermes Office berhenti (pid $PID)."
  else
    echo "Proses tidak ditemukan (stale pidfile dibersihkan)."
  fi
  rm -f "$PIDFILE"
  exit 0
fi
echo "Hermes Office tidak jalan."
