#!/usr/bin/env bash
# demo-gif.sh — skrip take GIF 15 detik yang konsisten untuk README / GitHub.
# Cara pakai:
#   1. bash scripts/start.sh            (pastikan collector jalan)
#   2. bash scripts/demo-gif.sh         (kirim rangkaian event sinematik)
#   3. Rekam layar http://127.0.0.1:3456 pakai ScreenToGif / OBS / ShareX,
#      mulai rekam ~1 detik SEBELUM menjalankan skrip ini, stop di detik ~16.
# Hasil: agen masuk → kerja (bubble tool) → chat (running text) →
#         sholat sila di musala → balik → keluar. Konsisten tiap take.
set -u
HOOK="http://127.0.0.1:3456/hook"
SID="gif-take-01"

post() { # $1 = json
  curl -s -m 5 -X POST "$HOOK" -H "Content-Type: application/json" -d "$1" > /dev/null
  echo "  → $2"
}

echo "== 🎬 Hermes Office demo take =="
echo "   MULAI REKAM LAYAR SEKARANG (15 detik). Tekan Enter untuk mulai…"
read -r _

echo "[0s] agen jalan masuk"
post '{"hook_event_name":"on_session_start","session_id":"'"$SID"'","cwd":"C:/demo/hermes-office","project":"hermes-office"}' "session_start"

sleep 3
echo "[3s] bubble tool"
post '{"hook_event_name":"pre_tool_call","session_id":"'"$SID"'","tool_name":"terminal","tool_input":{"command":"npm run build"},"cwd":"C:/demo/hermes-office"}' "tool: terminal › npm run build"
post '{"hook_event_name":"post_tool_call","session_id":"'"$SID"'","tool_name":"terminal","cwd":"C:/demo/hermes-office"}' "tool_end"

sleep 3
echo "[6s] chat panjang (running text)"
post '{"hook_event_name":"on_stream_end","session_id":"'"$SID"'","cwd":"C:/demo/hermes-office","extra":{"turn_id":"t1","final_text":"Build sukses 42 file dalam 8 detik, siap deploy ke staging sekarang juga tanpa error sama sekali"}}' "message panjang"

sleep 5
echo "[11s] subagent ikut kerja"
post '{"hook_event_name":"subagent_start","session_id":"'"$SID"'","agent_type":"Explore","cwd":"C:/demo/hermes-office"}' "subagent Explore"

sleep 2
echo "[13s] semua selesai, agen keluar"
post '{"hook_event_name":"subagent_stop","session_id":"'"$SID"'","agent_type":"Explore","cwd":"C:/demo/hermes-office"}' "subagent_end"
post '{"hook_event_name":"on_session_end","session_id":"'"$SID"'","cwd":"C:/demo/hermes-office"}' "session_end"

echo ""
echo "== ✅ take selesai (~15 detik). Stop rekaman. =="
echo "   Tips: potong 1 detik awal/akhir, export GIF 800px, < 5MB untuk README."
