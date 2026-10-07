// Hermes Office — event collector + SSE broadcaster + static frontend server
// No dependencies, Node.js built-ins only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const _req = createRequire(import.meta.url);
let DatabaseSync=null;try{DatabaseSync=_req('node:sqlite').DatabaseSync;}catch(e){}
const HER_HOME=process.env.HERMES_HOME||(process.env.LOCALAPPDATA?process.env.LOCALAPPDATA+'/hermes':null)||(process.env.USERPROFILE?process.env.USERPROFILE+'/AppData/Local/hermes':null);
function sessionCwd(sid){
  try{
    if(!DatabaseSync||!HER_HOME)return null;
    const _db=new DatabaseSync(HER_HOME+'/state.db');
    const _r=_db.prepare('SELECT cwd FROM sessions WHERE id=?').get(sid);
    _db.close();
    return (_r&&_r.cwd)||null;
  }catch(e){return null;}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const PORT = Number(process.env.HERMES_OFFICE_PORT || 3456);

const sseClients = new Set();

const BACKLOG=[];
function broadcast(obj) {
  BACKLOG.push(obj);while(BACKLOG.length>200)BACKLOG.shift();
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of [...sseClients]) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }
}

// Normalize incoming events from Hermes shell hooks / API SSE / manual posts
// into a canonical shape: { kind, sessionId, agentId, tool, text, ts }
const debugLog = [];
function basename(p){ return String(p).split(/[/\\]/).filter(Boolean).pop(); }
// NOTE: 'hermes-office' sengaja TIDAK masuk daftar ini — itu nama project asli.
// 'frontend','server','scripts' tetap generic sebagai filter subfolder dalam project.
const GENERIC=new Set(['home','documents','file faqod','frontend','server','scripts','desktop','downloads','workspace','projects','project','repo','repos','src','app','main','user','users','mybook hype amd','tmp','temp','scratch','cache','logs','npx','node_modules','.hermes','cache']);
function dirChain(p){
  // [terdalam ... terluar] — segmen valid pertama (dari dalam) yg menang
  const segs=String(p).split(/[/\\]/).filter(Boolean);
  const out=[];
  for(let i=segs.length-1;i>=0;i--){
    const b=segs[i].trim();
    if(!b||GENERIC.has(b.toLowerCase()))continue;
    if(/^[.-]/.test(b)||b.includes('.')||/["]/.test(b)||/\s/.test(b))continue;
    if(/^\d+$/.test(b)||/^\d+\.\d/.test(b)||/^\d+:\d+/.test(b)||/^\S+:\d+$/.test(b))continue;
    if(b.length<3)continue;
    out.push(b.slice(0,40));
  }
  return out;
}
const sessionProject=new Map();
// Ingatan session->project yang PERSISTEN (survive restart collector / EADDRINUSE).
// Disimpan di state.db tabel project_memory, dimuat sekali saat startup.
function loadProjectMemory(){
  try{
    if(!DatabaseSync||!HER_HOME)return;
    const _db=new DatabaseSync(HER_HOME+'/state.db');
    _db.exec('CREATE TABLE IF NOT EXISTS project_memory(session_id TEXT PRIMARY KEY, project TEXT, updated_at INTEGER)');
    const rows=_db.prepare('SELECT session_id, project FROM project_memory').all();
    _db.close();
    for(const r of rows){ if(r&&r.session_id&&r.project)sessionProject.set(String(r.session_id),String(r.project)); }
  }catch(e){}
}
function saveProjectMemory(sid,proj){
  try{
    if(!DatabaseSync||!HER_HOME)return;
    const _db=new DatabaseSync(HER_HOME+'/state.db');
    _db.exec('CREATE TABLE IF NOT EXISTS project_memory(session_id TEXT PRIMARY KEY, project TEXT, updated_at INTEGER)');
    _db.prepare('INSERT INTO project_memory(session_id,project,updated_at) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET project=excluded.project, updated_at=excluded.updated_at').run(String(sid),String(proj),Date.now());
    _db.close();
  }catch(e){}
}
loadProjectMemory();
function prettyProject(p){
  if(!p)return null;
  const b=String(p).trim();
  if(!b||GENERIC.has(b.toLowerCase()))return null;
  return b.slice(0,40);
}
function finalTextOf(raw){
  // on_stream_end: teks akhir ada di extra.final_text (objek / JSON string / string)
  let ex = raw.extra;
  if(typeof ex === 'string'){
    const t = ex.trim();
    if(t.startsWith('{')){
      try{ ex = JSON.parse(t); }catch(e){ return t.slice(0,500); }
    } else if(t) return t.slice(0,500);
  }
  if(ex && typeof ex === 'object'){
    for(const k of ['final_text','text','message','output','content']){
      if(ex[k] && String(ex[k]).trim()) return String(ex[k]).trim().slice(0,500);
    }
  }
  return null;
}
function projectFromInput(inp){
  if(!inp)return null;
  const vals=[];
  if(typeof inp==='string')vals.push(inp);
  else if(typeof inp==='object'){
    ['path','file','file_path','filepath','filename','dir','directory','workdir','cwd'].forEach(function(k){
      if(inp[k])vals.push(String(inp[k]));
    });
    // command: HANYA path file ber-ekstensi di dalamnya yg diambil; kata2 command dibuang total
    if(inp.command){
      const m=String(inp.command).match(/([A-Za-z]:)?[A-Za-z0-9_./\\\- ()]+\.[A-Za-z0-9]+\b/);
      if(m)vals.push(m[0]);
    }
  }
  for(const v of vals){
    const str=String(v);
    if(/\s/.test(str)&&!/[/\\\\]/.test(str))continue; // kalimat bebas tanpa path -> buang
    const chain=dirChain(str);
    if(chain.length)return chain[0]; // segmen valid TERDALAM
  }
  return null;
}
function normalize(raw) {
  const ts = Date.now();
  const sessionId = String(raw.session_id || raw.sessionId || raw.run_id || raw.session || raw.id || 'main').slice(0, 32);
  const agentId = raw.agent_id || raw.agentId || null;
  const hook = raw.hook_event_name || raw.hook || raw.type || raw.event || raw.name || '';
  const tool = raw.tool_name || raw.tool || null;
  // project group: explicit > gali tool_input paling spesifik > cwd > ingatan sesi
  const cwdRaw = raw.cwd || raw.working_dir || raw.workdir || raw.directory || raw.workspace;
  const fromInput = projectFromInput(raw.tool_input || raw.input || raw.args || raw.params);
  const remembered = sessionProject.get(sessionId) || null;
  const fresh = prettyProject(raw.project || raw.project_name) ||
    fromInput ||
    prettyProject(cwdRaw ? basename(cwdRaw) : null);
  if(fresh&&sessionId!=='main'){sessionProject.set(sessionId,fresh);saveProjectMemory(sessionId,fresh);}
  let project = fresh || remembered;
  if(!project&&sessionId&&sessionId!=='main'){
    const _cwd=sessionCwd(sessionId);
    if(_cwd){
      const _p=prettyProject(basename(_cwd));
      if(_p){project=_p;sessionProject.set(sessionId,_p);saveProjectMemory(sessionId,_p);}
    }
  }

  const _inp = raw.tool_input || raw.input || raw.params || null;
  let _detail = null;
  if(_inp){
    if(typeof _inp==='string')_detail=_inp;
    else if(typeof _inp==='object')_detail=_inp.command||_inp.path||_inp.file||_inp.file_path||_inp.query||_inp.text||_inp.prompt||null;
    if(_detail)_detail=String(_detail).slice(0,120);
  }
  if(!_detail&&raw.text&&String(raw.text).length<120)_detail=String(raw.text).slice(0,120);
  const base = { sessionId, agentId, tool, ts, project: project ? String(project).slice(0, 40) : null, detail: _detail };

  switch (hook) {
    case 'pre_tool_call':
    case 'tool_use':
      return { ...base, kind: 'tool_start', text: tool };
    case 'post_tool_call':
    case 'tool_result':
      return { ...base, kind: 'tool_end', text: tool };
    case 'session_start':
    case 'on_session_start':
    case 'run_start':
    case 'system':
    case 'init':
      return { ...base, kind: 'session_start', text: raw.text || null };
    case 'session_end':
    case 'on_session_end':
    case 'run_end':
    case 'result':
      return { ...base, kind: 'session_end', text: raw.text || raw.output || null };
    case 'on_stream_delta':
    case 'text':
    case 'delta':
      return { ...base, kind: 'typing' };
    case 'subagent_start':
      return { ...base, kind: 'subagent_start', text: raw.agent_type || raw.text || null };
    case 'subagent_end':
    case 'subagent_stop':
      return { ...base, kind: 'subagent_end' };
    case 'on_error':
    case 'tool_error':
    case 'hook_error':
    case 'session_error':
    case 'error': {
      const msg = raw.error || raw.message || raw.text || raw.output || finalTextOf(raw) || hook || 'unknown error';
      return { ...base, kind: 'hermes_error', text: String(msg).slice(0, 300) };
    }
    case 'message':
    case 'assistant_message':
    case 'on_message':
    case 'reply':
    case 'on_message_end':
    case 'on_stream_end':
    case 'stream_end':
      return { ...base, kind: 'message', text: raw.text || raw.message || raw.output || raw.content || finalTextOf(raw) };
    default:
      // Already canonical? e.g. { kind: 'session_start', ... }
      if (raw.kind) return { ...base, ...raw, ts };
      return { ...base, kind: 'unknown', text: hook || null, raw: undefined };
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(FRONTEND_DIR, urlPath));
  if (!file.startsWith(FRONTEND_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ kind: 'hello', ts: Date.now() })}\n\n`);
    BACKLOG.forEach(function(ev){ try{res.write(`data: ${JSON.stringify(ev)}\n\n`);}catch(e){} });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (pathname === '/hook' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const raw = JSON.parse(body || '{}');
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        const ev = normalize(item);
        broadcast(ev);
        let _dbg={ at: new Date().toISOString(), kind: ev.kind, project: ev.project, sessionId: ev.sessionId, tool: ev.tool, keys: Object.keys(item) };
        try{
          _dbg.cwd=item.cwd||item.working_dir||item.workdir||null;
          _dbg.rawProject=item.project||item.project_name||null;
          const _ti=item.tool_input||item.input||item.params||null;
          if(_ti)_dbg.toolInput=String(typeof _ti==='object'?JSON.stringify(_ti):_ti).slice(0,300);
          if(item.extra!==undefined)_dbg.extra=String(typeof item.extra==='object'?JSON.stringify(item.extra):item.extra).slice(0,300);
        }catch(e){}
        debugLog.push(_dbg);
        if (debugLog.length > 30) debugLog.shift();
        console.log(`[hook] ${ev.kind} project=${ev.project || '-'} session=${ev.sessionId} tool=${ev.tool || '-'}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, broadcast: items.length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    return;
  }

  if (pathname === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, events: debugLog }, null, 2));
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: sseClients.size, ts: Date.now() }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`[hermes-office] listening on http://127.0.0.1:${PORT}`);
  console.log(`[hermes-office] POST hooks -> http://127.0.0.1:${PORT}/hook`);
  console.log(`[hermes-office] SSE stream  -> http://127.0.0.1:${PORT}/events`);
});
