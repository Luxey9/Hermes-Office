# 🏢 Hermes Office 3D — Watch Your AI Agents Work in a Living Office

> Your Hermes sessions, visualized as tiny humans in a cozy 2-floor 3D office.
> Every session walks in, sits down, types, drinks coffee, prays, takes the lift — and you watch it all live.

![Node](https://img.shields.io/badge/node-18%2B-3ddc84?style=flat-square&logo=node.js)
![Deps](https://img.shields.io/badge/backend-0%20dependencies-e8b93c?style=flat-square)
![Three.js](https://img.shields.io/badge/three.js-vendored-3f8cff?style=flat-square)
![i18n](https://img.shields.io/badge/lang-ID%20%7C%20EN-9a63e8?style=flat-square)
![SSE](https://img.shields.io/badge/stream-SSE%20live-e05252?style=flat-square)

---

## ✨ What is this?

**Hermes Office** turns invisible AI agent activity into a living 3D office you can orbit, zoom, and follow.

| Without Hermes Office | With Hermes Office |
|---|---|
| Scroll terminal logs, guess what's running | See *who* is working, *on what project*, *doing what tool* — right now |
| 5 parallel sessions = chaos | 5 little humans sitting at desks, each labeled with its project |
| "Is it stuck or thinking?" | Bubble shows `⚙ Bash`, `💬 answering…`, `🤲 praying`, `🛗 in lift` |

### 🎬 The experience

1. You ask Hermes something in your terminal.
2. A tiny agent **walks through the foyer**, finds a free desk, **sits down**.
3. Its nametag says your **project name** (not some cryptic session id).
4. Every tool call pops a **bubble**: `⚙ terminal › git status…`.
5. Chat replies appear as **running-text bubbles** above its head.
6. Idle agents **drink coffee, chill on the rooftop, pray in the mushola** — then go back to work.
7. Session ends → agent **stays and hangs out** (lounge/pantry/rooftop), desk frees up for others.

---

## 🖼️ Layout

```
┌────────────────────────────────────────────────────────┬───────────────┐
│ Hermes Live 3D  ● terhubung  •  1 aktif  •  🟢 mission  │ ID EN buttons │
├────────────────────────────────────────────────────────┼───────────────┤
│ Filter: All Main Sub Worker │ − ＋ ⤢ │ Plan Rain View  │               │
│                                                        │  Log │ Live   │
│                                                        │  ──────────  │
│              3D OFFICE (orbit / zoom / click)          │  ⚙ agent →    │
│              drag: orbit • scroll: zoom                │    tool detail│
│              click agent = follow + detail panel       │  💬 chat text │
│                                                        │  ──────────  │
│                                                        │  Agents (1)   │
│                                                        │  ● name status│
└────────────────────────────────────────────────────────┴───────────────┘
```

The old giant "waiting for mission" panel is gone — mission status lives as a **small chip in the topbar**, the live tool/chat feed lives as a **Live tab in the sidebar**, and the canvas gets all the room.

---

## 🏛️ The office (2 floors + lift)

**Floor 1 — work mode**

| Zone | What's there |
|---|---|
| DEV CLUSTER | 8 desks, acoustic dividers, dual/ultrawide/vertical monitor variants |
| STANDING | standing desks (agents work standing up) |
| EXEC POD | L-desk + kanban board |
| SERVER | glass walls, LED-blinking racks, precision AC |
| FOYER | reception + glowing project neon sign |
| CONFERENCE | oval table, 8 chairs, TV, glassboard |
| WAR ROOM | incident screen (turns red 🚨 on errors) |
| LOUNGE | corner sofa, egg chair, 2P arcade, bookshelf |
| PANTRY | granite counter, espresso machine, bar table |

**Floor 2 — rest & pray**

| Zone | What's there |
|---|---|
| MUSHOLA IKHWAN | imam rug (gold) at front + 2 makmum rows × 3 green rugs, facing north (kiblat) |
| MUSHOLA AKHWAT | 2 rows × 4 purple rugs aligned with ikhwan rows, **no imam** |
| WUDHU | shared room south of mushola, wooden partition M/F, 4 water taps per side (no sinks/mirrors) |
| MEETING | one big room (x12–23), oval table for 8 — merged, no more split wall |
| GUDANG | crate stacks, pallets, SAFETY neon |
| ROOFTOP | garden terrace, string lights, high table + stools |
| BOOTH ×3 | glass call booths |
| PANTRY 2 | chalkboard (`ngopi dulu, baru ngoding`), snack shelf, fridge |
| LIFT | glass elevator, animated doors + cabin, auto ferry every ~30s |

### 🤲 The mushola detail (we're proud of this)

Most dashboards would seat agents in the prayer room like it's another desk. Ours doesn't:

- Agents **never spawn to work** in the mushola (`freeSpotFor` excludes it).
- Saf layout follows real congregational order: **imam in front, makmum rows behind**; akhwat rows align with ikhwan rows, no female imam.
- Wudhu room has **only water taps + a gender partition** — no sinks, no mirrors.
- When an agent prays, it walks to a rug and sits **sila (cross-legged)** — thighs opened sideways, knees fully folded, torso upright, hands on thighs, head slightly bowed with a slow nod.
- `workT` timer **pauses** during prayer. Worship is not work.
- ~14 seconds, bubble `sholat dulu 🤲`, then it walks back to a work desk (via lift if needed).
- Status panel shows `🤲 sholat`, agent list shows the same.

---

## 🚀 Quickstart

**Requirements:** Node.js 18+. Zero npm dependencies for the backend. Three.js is vendored (`frontend/vendor/`), so it works fully offline.

```bash
# 1. Start (Linux/macOS/Git-Bash)
bash scripts/start.sh
# → Hermes Office jalan di http://127.0.0.1:3456

# 2. Open
open http://127.0.0.1:3456   # or just click it

# 3. Stop
bash scripts/stop.sh
```

Windows PowerShell (no bash):

```powershell
node server\collector.mjs
# buka http://localhost:3456
```

Port override: `HERMES_OFFICE_PORT=4567 bash scripts/start.sh`

---

## 🔌 Connect your real Hermes

1. Start the collector (above).
2. **Merge** (don't blindly overwrite if you already have hooks!) `hooks-example.yaml` into your Hermes config:
   - Windows: `%USERPROFILE%\.hermes\config.yaml`
   - Linux/macOS: `~/.hermes/config.yaml`
   
   Format is `hooks.<event>:` mapping — see the file's header comment for the exact shape.
3. Approve the hooks when Hermes asks (first run), or set `hooks_auto_accept: true`, or run `hermes --accept-hooks`.
4. Verify: `hermes hooks list` and `hermes hooks doctor`.
5. Work normally — sessions appear as labeled characters, tool calls as bubbles.

> Dashboard empty while Hermes works? Check in order: collector running? (`/health`) → hooks registered? (`hermes hooks list`) → consent approved? (`~/.hermes/shell-hooks-allowlist.json`).

**Manual test** (no Hermes needed):

```bash
curl -X POST http://127.0.0.1:3456/hook -H "Content-Type: application/json" \
  -d '{"hook_event_name":"on_stream_end","session_id":"TEST123","extra":{"final_text":"halo, bubble test!"}}'
```

Or press **▶ Demo** in the topbar for fake agents.

---

## 🧠 How project naming works (the part everyone asks about)

Agents show **project names, never session ids**. The collector (`server/collector.mjs`) resolves names in priority order:

```
explicit project field
  → tool_input paths (deepest valid folder wins: scripts/stop.sh → hermes-office)
  → basename(cwd)
  → persistent session→project memory (SQLite, survives restarts)
  → state.db sessions.cwd
  → filter GENERIC junk (home, documents, frontend, server, scripts, …)
```

Notable: `hermes-office` itself is **not** generic — a real project name is never thrown away. Subfolders (`frontend`, `server`, `scripts`) are, so inner paths bubble up to the project root. First confirmed name gets **locked** (`lockedProj`) so later noisy events can't rename the agent.

Chat text is dug out of `extra.final_text` (object / JSON-string / plain string all handled) so plain replies without tool calls still get bubbles.

---

## 📡 Events & API

Backend: one file, `server/collector.mjs` — static file server + `POST /hook` + SSE broadcast + backlog replay. No frameworks.

| Endpoint | Method | What |
|---|---|---|
| `/` | GET | dashboard (`frontend/index.html`) |
| `/events` | GET (SSE) | live stream + backlog replay on connect |
| `/hook` | POST | ingest Hermes hook JSON → normalized → broadcast |
| `/debug` | GET | last 30 normalized events (kind/project/session/tool/cwd) |
| `/health` | GET | `{ok, clients, ts}` |
| `/vendor/*` | GET | vendored three.js + OrbitControls (offline) |

Canonical event shape on the wire:

```json
{ "kind": "message", "sessionId": "20261007_074026_dd8083",
  "agentId": null, "tool": null, "text": "halo, bubble test!",
  "project": "hermes-office", "detail": null, "ts": 1791371259633 }
```

| kind | Dashboard reaction |
|---|---|
| `session_start` (+`project`) | agent walks in, sits, nametag = project |
| `tool_start` (+`tool`) | `⚙ tool › detail…` bubble + activity row `agent → tool` |
| `tool_end` | `✓` bubble (or 🚨 incident on error) |
| `message` | 💬 running-text bubble + activity row `agent: text…` |
| `subagent_start` | child agent spawns (`🤖 label 🚀 type`) |
| `session_end` | agent stays, hangs out (lounge/pantry/rooftop), desk frees (no log spam) |
| `hermes_error` | red banner + activity row + 🚨 war-room incident (live only, replay-safe) |

**Resilience details worth stealing:**

- **Backlog replay** (200 events) — refresh mid-work and agents re-spawn from backlog, never an empty building.
- **`spawnMissing` fallback** — `tool_*`/`message` arriving without a prior `session_start` (e.g. collector restarted mid-session) spawn the agent on the spot instead of being dropped.
- **Idle-vs-event bubble guard** — ambient chatter (`ngantuk… 🥱`) never overwrites a live work/chat bubble.
- **Spam dedup** — identical events within 8s collapse into `×2 ×3`.
- **Log pagination** — Activity log shows 10 rows/page, Live tab keeps the last 10 raw feed rows.

---

## 🖱️ Controls

| Control | What |
|---|---|
| drag / scroll | orbit / zoom (OrbitControls, damped) |
| click agent | follow-cam: zoom-in + auto floor filter (Lihat follows agent) + detail panel (project, session, zone, status) |
| Filter All/Main/Sub/Worker | show only that agent kind |
| ⤢ Reset | home camera, stop follow |
| Denah (Plan) | top-down floorplan view |
| Hujan (Rain) | 900-particle rain |
| Lihat (View) | Semua / Lt 1 / Lt 2 — auto-follows the followed agent's floor |
| ID/EN button | full UI language toggle (persisted in `localStorage`) |
| ▶ Demo | fake agents walk in and work |
| Agents list | 5 per page, paginated, fixed height (no scroll) |
| Activity log | 10 rows per page, paginated |
| Error banner | red bar under topbar for Hermes errors, click ✕ to dismiss |

Bottom **Shortcut bar** renders every shortcut as clickable `kbd` buttons (Space = pause, D = demo, C = clear, F = filter, R = plan, H = rain, G = floor, L = log, …) — same actions as the keyboard.

---

## 🌐 Language (ID/EN)

The whole UI is bilingual. The `ID` button in the topbar flips every string — connection status, mission chip, filter labels, Plan/Rain/View buttons, hints, panel titles, agent statuses (`🚶 jalan` ↔ `🚶 walking`, `☕ ngopi` ↔ `☕ coffee`, …), detail panel (`Project/Session/Zone/Status`), even the footer caption. Choice persists across refreshes. Adding a third language = one object in the `I18N` map in `office3d.js`.

---

## 🗂️ Structure

```
hermes-office/
├── server/collector.mjs      # HTTP + SSE + static server, zero deps
├── frontend/
│   ├── index.html            # shell: topbar, tools, canvas, sidebar tabs
│   ├── office3d.js           # Three.js scene: office, agents, bubbles, i18n (~3.200 lines)
│   ├── style.css             # dark theme, sidebar, tabs, pagination, shortcuts
│   ├── logo.png
│   ├── backsound.mp3
│   └── vendor/
│       ├── three.module.js       # vendored, offline-capable
│       └── controls/OrbitControls.js
├── scripts/start.sh | stop.sh
├── hooks-example.yaml        # copy-merge into Hermes config.yaml
├── office.log                # runtime log (gitignored in spirit)
└── README.md
```

---

## 🎥 Demo 15 detik (buat GIF README)

```bash
bash scripts/start.sh
bash scripts/demo-gif.sh   # mulai rekam layar 1 detik sebelumnya, stop di ~16 detik
```

Rangkaian sinematik deterministik: agen masuk → bubble tool → chat panjang
(running text) → subagent ikut → semua keluar. Konsisten tiap take —
potong 1 detik awal/akhir, export GIF 800px < 5MB, taruh di atas badges.

## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| `Uncaught ReferenceError: cv is not defined` / stale JS | Hard refresh; every deploy bumps `office3d.js?v=3dN` cache-buster |
| `GET /vendor/controls/OrbitControls.js 404` | Restore `vendor/controls/` folder structure (importmap maps `three/addons/` → `./vendor/`) |
| Empty building after refresh | Check `/health` + `/debug`; backlog replays on connect — if truly empty, no hooks are posting |
| Agent named "Sesi" | Collector couldn't resolve a project — check hook payload has `project`/`cwd`; see naming section |
| `EADDRINUSE :3456` | `bash scripts/stop.sh`, kill the stale pid, start again |
| Port clash | `HERMES_OFFICE_PORT=4567 bash scripts/start.sh` |

---

## 📱 Remote access

To watch from your phone: expose port 3456 via **Tailscale** or an SSH tunnel. Never expose it raw to the internet — `/hook` accepts unauthenticated local POSTs by design.

---

## 🗺️ Roadmap

- [ ] Running-text bubbles via texture-window scroll (partially in)
- [x] Session-end hangout (agent stays, idles in lounge/pantry/rooftop)
- [x] Follow-cam with auto floor filter + room labels
- [x] Mushola saf order (imam front, makmum rows) + wudhu taps + M/F partition
- [x] Hermes error banner + war-room incident (replay-safe)
- [ ] Click-to-teleport agent to a zone
- [ ] Sound design: lift ding, rain loop sync
- [ ] Multi-office: one dashboard, several collectors
- [ ] Session replay from `office.log`

---

## 🤝 Contributing

PRs welcome. The codebase is intentionally dependency-free on the backend — please keep it that way. Frontend: vanilla Three.js, no build step, edit and refresh.

1. Fork → edit → hard-refresh to test (`?v=` bump in `index.html`).
2. `node --input-type=module --check < frontend/office3d.js` must pass (no output = OK).
3. Describe what your agents *do* differently, with a screenshot/GIF.

---

## 📄 License

MIT — build your own office. If it makes you smile, leave a ⭐.
